'use client'

// The inbox's state, data loading and handlers: everything app/admin/inbox/page.tsx
// held before its JSX, moved here unchanged. The page and its pieces read the
// returned values through InboxContext.

import { peekCompanyUser, readCache, resolveCompanyUser, writeCache } from '@/lib/client-cache'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { getEffectiveEntitlements } from '@/lib/entitlements-client'
import { flagEnabled } from '@/lib/feature-flags'
import { supabase } from '@/lib/supabase'
import { useAttachmentToken } from '@/lib/useAttachmentToken'
import { publishAiContext } from '@/lib/ai-context'
import { MediaItem } from '@/components/MediaGallery'
import { emailAttachmentKind, emailAttachmentUrl } from '@/components/EmailMessage'
import { useActiveCall } from '@/lib/active-call'
import { isOldPhoneVideo } from '@/lib/web-video'
import { authFetch } from '@/lib/auth-fetch'
import { useAiDraft } from '@/components/AiDraft'
import { useReplyTranslate } from '@/components/inbox/ReplyTranslate'
import { useDraft } from '@/lib/drafts'
import { ColvyChatRow, useColvySummary } from '@/components/inbox/ColvyChat'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import { fillTemplateVars, type TemplateVars } from '@/lib/composer-templates'
import { readJsonSafe, uploadAttachment } from '@/lib/upload-attachment'
import { boardUrl } from '@/lib/redirect'
import { enrichNames } from '@/lib/team-names'
import { broadcastMessage } from '@/lib/chat-broadcast'
import { uploadQueue } from '@/lib/upload-queue'
import MentionInput, { resolveMentions as resolveTeamMentions } from '@/components/MentionInput'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { REVIEW_REQUEST_SUBJECT, pickReviewChannel, type ReviewChannel } from '@/lib/review-request'
import { latestChatMs, todosGeneratedAt } from '@/lib/task-dedupe'
import Popover, { useOneOpen } from '@/components/composer/Popover'
import ReviewRequestButton from '@/components/composer/ReviewRequestButton'
import BookingLinkButton from '@/components/booking/BookingLinkButton'
import { decodeEntities as dec } from '@/lib/decode-entities'
import { useClickOutside } from '@/lib/use-click-outside'
import { tagVoice, voiceKind } from '@/lib/voice-typed'
import { agentChannel, useAgentTeam } from '@/components/agents/useAgentTeam'
import { Contact, Conversation, Highlight, INBOX_HOUR12, Icon, Message, PAYMENT_SIGNAL_PHRASES, THREAD_PAGE, TeamMember, extractFromText, initialsOf, makeSnippet, parseTs, runPool, sendChannelGlyph, setInboxHour12, threadCacheGet, threadCacheSet, toolBtn, tsOf, videoPoster } from '@/components/inbox/inbox-shared'

// The contacts behind the list's rows, by id. One failed query used to blank
// every name in the inbox (the rows fell back to their phone numbers): a column
// the database doesn't have yet (avatar_url, prexty_customer_id), a contact_id
// that isn't a uuid, or too many ids for one URL after "Load more". So: asked
// in batches, malformed ids left out, and the extra columns dropped if the
// database refuses them (remembered, so it isn't asked again).
const CONTACT_COLS = ['id, name, email, phone, relationship_type, prexty_customer_id, avatar_url', 'id, name, email, phone, relationship_type', 'id, name, email, phone']
let contactColsAt = 0
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
async function contactsByIds(ids: string[]): Promise<Record<string, any>> {
  const byId: Record<string, any> = {}
  const list = Array.from(new Set(ids.filter(Boolean)))
  for (let i = 0; i < list.length; i += 80) {
    const chunk = list.slice(i, i + 80)
    let rows: any[] | null = null
    for (let at = contactColsAt; at < CONTACT_COLS.length && rows === null; at++) {
      try {
        const r = await (supabase as any).from('contacts').select(CONTACT_COLS[at]).in('id', chunk)
        if (!r.error) { rows = r.data || []; contactColsAt = at; break }
        // A bad id fails the whole batch: retry this batch with only real ones.
        if (/uuid/i.test(String(r.error.message || ''))) {
          const ok = chunk.filter(x => UUID_RE.test(x))
          const r2 = ok.length ? await (supabase as any).from('contacts').select(CONTACT_COLS[at]).in('id', ok) : { data: [], error: null }
          if (!r2.error) { rows = r2.data || []; contactColsAt = at; break }
        }
      } catch { /* try fewer columns */ }
    }
    for (const ct of rows || []) byId[ct.id] = ct
  }
  return byId
}

// A phone thread (SMS, calls) that started before its contact existed has no
// contact_id, so the list showed the bare number while the open thread (which
// matches by phone) showed the name. Match such rows by the number's last 9
// digits, attach the contact, and save the link in the background. The main
// list load does the same inline; this is for the rows pulled in by a search
// or a pin, which skipped it.
const digitsOf = (p: string) => String(p || '').replace(/\D/g, '')
async function linkPhoneThreads(companyId: string, rows: any[]): Promise<void> {
  const unlinked = rows.filter((c: any) => !c.contact_id && digitsOf(c.sms_number || c.phone).length >= 8)
  if (!unlinked.length) return
  const tails = Array.from(new Set(unlinked.map((c: any) => digitsOf(c.sms_number || c.phone).slice(-9)))).slice(0, 60)
  try {
    const { data: cand } = await (supabase as any).from('contacts').select('id, name, email, phone, relationship_type').eq('company_id', companyId)
      .or(tails.map(t => `phone.ilike.%${t}%`).join(',')).limit(200)
    if (!cand?.length) return
    const linked: { conv: string; contact: string }[] = []
    for (const c of unlinked) {
      const tail = digitsOf(c.sms_number || c.phone).slice(-9)
      const m = cand.find((ct: any) => ct.phone && digitsOf(ct.phone).endsWith(tail))
      if (m) { c.contacts = m; c.contact_id = m.id; linked.push({ conv: c.id, contact: m.id }) }
    }
    if (linked.length) runPool(linked, 4, l => (supabase as any).from('conversations').update({ contact_id: l.contact }).eq('id', l.conv))
  } catch { /* the number still shows */ }
}

export function useInboxController() {
  // Seed from the shared identity cache + the last conversation list we rendered
  // so a revisit shows the inbox instantly instead of "Loading inbox…".
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededConvs = seededCid ? readCache<Conversation[]>(`inbox-convs:${seededCid}:open`) : undefined
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [companyInfo, setCompanyInfo] = useState<any>(null)
  // Per-company operational flag (default ON): may this company text the upload
  // link to the customer's mobile? Off = links only post in the conversation.
  const [mediaSmsEnabled, setMediaSmsEnabled] = useState(true)
  // Does this workspace's plan include outbound SMS? Default true so the upsell
  // banner never flashes before entitlements load. When false, we surface an
  // "Enable SMS" CTA at the exact moment an agent could be texting a customer.
  const [smsIncluded, setSmsIncluded] = useState(true)
  // A reply blocked for SMS credit (past the allowance, balance too low):
  // shown above the reply box with a Top up link until the next send works.
  const [smsCreditError, setSmsCreditError] = useState('')
  useEffect(() => {
    let cancelled = false
    getEffectiveEntitlements()
      .then(e => {
        if (cancelled) return
        setMediaSmsEnabled(flagEnabled(e.features, 'media_sms_fallback'))
        const cap = Number(e.limits?.smsPerMonth ?? 0)
        setSmsIncluded(cap > 0)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [user, setUser] = useState<any>(null)
  // The current agent's display name for message authorship and read receipts.
  // Prefers the owner-set team_members.name, then the person's own account name,
  // then their email prefix, then 'Agent'. Everything that stamps "who did this"
  // uses this so an owner-set name shows on NEW messages/reads (existing ones are
  // stored historically and don't change).
  const [myName, setMyName] = useState<string>('Agent')
  useEffect(() => {
    const uid = user?.id
    if (!uid) return
    const md = user?.user_metadata || {}
    const authName = md.display_name || (user?.email ? String(user.email).split('@')[0] : '') || ''
    if (authName) setMyName(authName)
    if (!companyId) return
    ;(supabase as any).from('team_members').select('name').eq('company_id', companyId).eq('user_id', uid).limit(1)
      .then(({ data }: any) => { const n = data?.[0]?.name; setMyName(n || authName || 'Agent') }, () => {})
  }, [user?.id, companyId])
  const [conversations, setConversations] = useState<Conversation[]>(seededConvs ?? [])
  const conversationsRef = useRef<Conversation[]>(conversations)
  conversationsRef.current = conversations
  const [selected, setSelected] = useState<Conversation | null>(null)
  // Token for this conversation's Gmail attachment links (members only).
  const attToken = useAttachmentToken(selected?.id)
  const selectedRef = useRef<Conversation | null>(null)

  // Publish the open conversation + contact so the floating Colvy AI assistant
  // knows what "reply to this customer" or "task for this chat" refers to. It
  // clears itself on navigation, so we re-publish whenever the selection moves.
  useEffect(() => {
    publishAiContext({ conversationId: selected?.id || null, contactId: (selected as any)?.contact_id || null })
  }, [selected?.id, (selected as any)?.contact_id])
  const loadWooDataRef = useRef<((id: string | null) => void) | null>(null)
  // Inbox settings popover + the 12/24-hour time-format choice (per-user).
  // Re-render when the company's time format loads (it's chosen in Settings →
  // Profile, under Customisation).
  const [, setHour12] = useState(INBOX_HOUR12)
  const [showMergePicker, setShowMergePicker] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  // The thread's gallery: chat photos/videos first (their indices are used
  // directly by the bubbles), then photos/videos that arrived on emails.
  const chatGalleryMedia = (): MediaItem[] => {
    const out: MediaItem[] = []
    galleryMessages.forEach(m => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a: any) => {
      const isImg = a.kind === 'image' || String(a.type||'').startsWith('image'); const isVid = a.kind === 'video' || String(a.type||'').startsWith('video'); if ((isImg || isVid) && a.url) out.push({ url: a.url, name: a.name, kind: isVid ? 'video' : 'image', poster: videoPoster(a) })
    }))
    return out
  }
  const emailGalleryMedia = (): (MediaItem & { key: string })[] => {
    const out: (MediaItem & { key: string })[] = []
    galleryMessages.forEach(m => (Array.isArray((m as any).email_attachments) ? (m as any).email_attachments : []).forEach((a: any, i: number) => {
      const kind = emailAttachmentKind(a); const url = emailAttachmentUrl(m, a, attToken)
      if (kind && url) out.push({ key: `${m.id}:${i}`, url, name: a.name, kind })
    }))
    return out
  }
  const openEmailMedia = (messageId: string, attachmentIndex: number) => {
    const at = emailGalleryMedia().findIndex(x => x.key === `${messageId}:${attachmentIndex}`)
    if (at >= 0) setGalleryIndex(chatGalleryMedia().length + at)
  }
  // A photo or video sent with an email (kept as a chat attachment).
  const openChatMedia = (url: string) => {
    const at = chatGalleryMedia().findIndex(x => x.url === url)
    if (at >= 0) setGalleryIndex(at)
  }
  const [storyView, setStoryView] = useState<{ items: MediaItem[]; index: number } | null>(null)
  const [showDoa, setShowDoa] = useState(false)
  const [doaMatch, setDoaMatch] = useState(false)
  const [convActions, setConvActions] = useState<Record<string, any>>({})
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showRecordSale, setShowRecordSale] = useState(false)
  // Whether this conversation already has a recorded sale — used to suppress the
  // "did this convert to a sale?" nudge so it isn't recorded twice.
  const [convHasSale, setConvHasSale] = useState(false)
  const [showMediaRequest, setShowMediaRequest] = useState(false)
  const [mrPrompt, setMrPrompt] = useState('')
  const [mrAccept, setMrAccept] = useState<string[]>(['image', 'video', 'pdf'])
  const [mrMaxFiles, setMrMaxFiles] = useState('10')
  const [mrExpiry, setMrExpiry] = useState('168')
  const [mrSaving, setMrSaving] = useState(false)
  // "Create ticket" turns the reply box into a Ticket box (a third tab next
  // to Reply and Note) until the ticket is created or discarded.
  const [ticketMode, setTicketMode] = useState(false)
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
  // Media the agent has attached but NOT yet sent — shown as preview cards above
  // the composer and delivered only when Send is pressed (alongside any text).
  const [stagedMedia, setStagedMedia] = useState<any[]>([])
  // Phone-upload QR: scan to upload photos from a phone straight into the
  // composer as staged media (with the same preview + expiry as any attachment).
  const [showInboxQR, setShowInboxQR] = useState(false)
  // Per-item media-expiry choice, keyed by item id: 'forever' (default) | '1d' |
  // '7d' | '30d' | a yyyy-mm-dd date. Absent = keep forever.
  const [stagedExpiry, setStagedExpiry] = useState<Record<string, string>>({})
  const [expiryMenuFor, setExpiryMenuFor] = useState<string | null>(null)
  const [customDateFor, setCustomDateFor] = useState<string | null>(null)
  // Advanced: also permanently delete the media from Colvy after it expires
  // (access-only revocation is the default). Off unless explicitly turned on.
  const [expiryDeleteMode, setExpiryDeleteMode] = useState(false)
  // Bulk expiry — set the same expiry on every staged item at once (matches the
  // mobile app). Its own open/date state, kept separate from the per-item menu.
  const [bulkExpiryOpen, setBulkExpiryOpen] = useState(false)
  const [bulkCustomDate, setBulkCustomDate] = useState(false)
  // The live phone call, if any — so the list can flag "Call in progress" on the
  // conversation being called. Published by CallBar / IncomingCallListener.
  const activeCall = useActiveCall()
  // Voice note recording (works in reply and internal-note modes).
  const [recording, setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const [voiceUploading, setVoiceUploading] = useState(false)
  const mediaRecRef = useRef<any>(null)
  const recChunksRef = useRef<any[]>([])
  const recTimerRef = useRef<any>(null)
  const recCancelRef = useRef(false)
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
  // Old picture-message videos (3GP) play on phones but not in a browser: have
  // the server turn each one into an MP4 the first time it's on screen, then
  // show that. Remembered per message, so a refresh that re-reads the thread
  // mid-conversion still ends up showing the MP4.
  const webMp4Ref = useRef(new Map<string, any[] | 'pending' | 'failed'>())
  useEffect(() => {
    const done = webMp4Ref.current
    const patch = (id: string, atts: any[]) => setMessages(prev => prev.map(m => m.id === id ? { ...m, attachments: atts } : m))
    for (const m of messages) {
      if (!Array.isArray(m.attachments) || !m.attachments.some(a => isOldPhoneVideo(a))) continue
      const state = done.get(m.id)
      if (Array.isArray(state)) { if (m.attachments !== state) patch(m.id, state); continue }
      if (state) continue
      done.set(m.id, 'pending')
      authFetch('/api/media/web-mp4', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: m.id }) })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (j?.converted && Array.isArray(j.attachments)) { done.set(m.id, j.attachments); patch(m.id, j.attachments) }
          else done.set(m.id, 'failed')
        })
        .catch(() => done.set(m.id, 'failed'))
    }
  }, [messages])
  // The open thread's loaded window: `since` is the created_at of the oldest
  // message loaded, or null when the WHOLE history is loaded. Refreshes re-read
  // only from `since` onwards, so they never drop pages the agent scrolled to.
  const [threadWin, setThreadWinState] = useState<{ convId: string | null; since: string | null }>({ convId: null, since: null })
  const threadWinRef = useRef<{ convId: string | null; since: string | null }>({ convId: null, since: null })
  const setThreadWin = (w: { convId: string | null; since: string | null }) => { threadWinRef.current = w; setThreadWinState(w) }
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loadingOlderRef = useRef(false)
  // Attachment-bearing messages OLDER than the loaded window (light columns
  // only), so the gallery and "Shared media & files" still cover the whole
  // conversation exactly as before windowing.
  const [olderMedia, setOlderMedia] = useState<{ convId: string; since: string; rows: any[] } | null>(null)
  const galleryMessages = useMemo<Message[]>(() => {
    const rows = olderMedia && olderMedia.convId === threadWin.convId && threadWin.since ? olderMedia.rows : []
    if (!rows.length) return messages
    const have = new Set(messages.map(m => m.id))
    return [...rows.filter((r: any) => !have.has(r.id)), ...messages]
  }, [messages, olderMedia, threadWin])
  // Per-thread lookups the message list needs, computed once per change of the
  // messages instead of on every render of this page (each keystroke in the
  // composer re-renders it): reply-to targets (was a linear find per bubble),
  // call ids that already have a timeline card, and the media gallery index.
  const threadIndex = useMemo(() => {
    const byId = new Map<any, Message>()
    const linkedCallIds = new Set<any>()
    for (const m of messages as any[]) {
      if (!byId.has(m.id)) byId.set(m.id, m)
      if (m.metadata?.call_event && m.metadata?.call_id) linkedCallIds.add(m.metadata.call_id)
    }
    const galleryMedia: MediaItem[] = []
    const mediaIndexOf: Record<string, number> = {}
    galleryMessages.forEach(m => {
      const ma = Array.isArray(m.attachments) ? m.attachments : []
      ma.forEach((a: any) => {
        if (a.kind === 'image' || a.kind === 'video') {
          mediaIndexOf[a.url] = galleryMedia.length
          galleryMedia.push({ url: a.url, name: a.name, kind: a.kind })
        }
      })
    })
    return { byId, linkedCallIds, galleryMedia, mediaIndexOf }
  }, [messages, galleryMessages])
  // Smart sale detection: when a recent message reads like a payment happened,
  // prompt the agent to log the sale. Deterministic phrase match — instant, free
  // and reliable, no model call per message. Dismissals are per-conversation for
  // the tab session so it never nags.
  const [saleDismissed, setSaleDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(sessionStorage.getItem('colvy_sale_prompt_dismissed') || '[]')) } catch { return new Set() }
  })
  const dismissSalePrompt = (id: string) => setSaleDismissed(prev => {
    const n = new Set(prev); n.add(id)
    try { sessionStorage.setItem('colvy_sale_prompt_dismissed', JSON.stringify([...n])) } catch {}
    return n
  })
  const paymentSignal = useMemo(() => {
    const recent = messages.slice(-6)
    return recent.some(m => { const t = String((m as any).content || '').toLowerCase(); return PAYMENT_SIGNAL_PHRASES.some(p => t.includes(p)) })
  }, [messages])

  // Has a sale already been recorded for the open conversation? If so (or if the
  // customer already matches an ecommerce order), the payment is on record and
  // the "record a sale" nudge would double-count — so it's suppressed below.
  useEffect(() => {
    const id = selected?.id
    if (!id) { setConvHasSale(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const { count } = await (supabase as any).from('conversation_sales').select('id', { count: 'exact', head: true }).eq('conversation_id', id)
        if (!cancelled) setConvHasSale((count || 0) > 0)
      } catch { if (!cancelled) setConvHasSale(false) }
    })()
    return () => { cancelled = true }
  }, [selected?.id])
  const [contact, setContact] = useState<Contact | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  // Owners, admins and the platform super admin: they see why an email's text
  // couldn't be loaded, and how to install the chat widget.
  const isManager = String(user?.email || '').toLowerCase() === 'bishalstha76@gmail.com'
    || teamMembers.some(m => m.user_id === user?.id && ['owner', 'admin'].includes(String(m.role || '').toLowerCase()))
  const canSeeEmailWhy = isManager
  const [reply, setReply] = useState('')
  // ✨ Draft reply (chat/SMS composer): AI writes the next reply for the agent to review.
  const aiDraft = useAiDraft({ companyId, conversationId: selected?.id || null, onDraft: t => setReply(t), getText: () => reply })
  // Reply in the customer's language (components/inbox/ReplyTranslate).
  const replyTr = useReplyTranslate({ companyId, conversationId: selected?.id || null, getText: () => reply, setText: t => setReply(t) })

  // ── Coax-style resizable composer ──────────────────────────────────────
  // The reply box can be dragged taller/shorter via the grab handle on its top
  // border. The chosen height is remembered per-agent (localStorage) so it
  // survives reloads and conversation switches.
  const COMPOSER_MIN = 64, COMPOSER_MAX = 420
  const [composerH, setComposerH] = useState<number>(96)
  const [composerDragging, setComposerDragging] = useState(false)
  useEffect(() => {
    try { const s = Number(localStorage.getItem('colvy_composer_h')); if (s >= COMPOSER_MIN && s <= COMPOSER_MAX) setComposerH(s) } catch {}
  }, [])
  const startComposerResize = (startY: number) => {
    const startH = composerH
    setComposerDragging(true)
    const onMove = (clientY: number) => {
      // Drag UP (clientY decreases) grows the box; DOWN shrinks it.
      const next = Math.min(COMPOSER_MAX, Math.max(COMPOSER_MIN, Math.round(startH + (startY - clientY))))
      setComposerH(next)
    }
    const onMouseMove = (e: MouseEvent) => { e.preventDefault(); onMove(e.clientY) }
    const onTouchMove = (e: TouchEvent) => { if (e.touches[0]) onMove(e.touches[0].clientY) }
    const stop = () => {
      setComposerDragging(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', stop)
      document.body.style.userSelect = ''
      try { localStorage.setItem('colvy_composer_h', String(composerHRef.current)) } catch {}
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', stop)
  }
  // Keep the latest height available to the drag-stop closure without re-binding.
  const composerHRef = useRef(composerH)
  useEffect(() => { composerHRef.current = composerH }, [composerH])

  // Keep an unsent reply so it survives switching conversations, a reload, or
  // coming back tomorrow. Personal to the signed-in agent.
  const draft = useDraft(
    user?.id || null, companyId, 'message', selected?.id || '',
    { text: reply },
    { enabled: !!selected, isEmpty: (v: any) => !v?.text || !v.text.trim() }
  )
  // Load THIS conversation's draft into the composer — and drop the previous
  // conversation's text the moment we switch. `reply` is a single state cell
  // shared across conversations, so without this the leftover text would be
  // auto-saved under whatever conversation is opened next. Gated on
  // `restoredFor` (not `ready`), which tells us the loaded draft is for the
  // currently-selected conversation, since ready/restored lag a render behind.
  useEffect(() => {
    const id = selected?.id || ''
    if (draft.restoredFor !== id) { setReply(''); return }   // switched; this conv's draft not loaded yet
    setReply(draft.restored?.text || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, draft.restoredFor])
  const [sending, setSending] = useState(false)
  // "Sending…" belongs to the chat the send started in; a newly opened chat's
  // composer is free straight away (the earlier send finishes on its own).
  useEffect(() => { setSending(false) }, [selected?.id])
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  // All / Assigned to me / Unassigned tabs above the conversation list.
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned' | 'unread'>('all')
  // ?view=unread|unassigned|mine — dashboard tiles open the inbox on that tab.
  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('view')
      if (v === 'unread' || v === 'unassigned' || v === 'mine') setAssignFilter(v)
    } catch {}
  }, [])
  // Coax-style arrow scrolling for the assignment strip: arrows appear only when
  // the row overflows, and dim at each end.
  const assignScrollRef = useRef<HTMLDivElement>(null)
  const [assignArrows, setAssignArrows] = useState({ l: false, r: false })
  const updateAssignArrows = useCallback(() => {
    const el = assignScrollRef.current
    if (!el) return
    const l = el.scrollLeft > 2
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setAssignArrows(prev => (prev.l === l && prev.r === r) ? prev : { l, r })
  }, [])
  useEffect(() => {
    updateAssignArrows()
    const el = assignScrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateAssignArrows, { passive: true })
    window.addEventListener('resize', updateAssignArrows)
    return () => { el.removeEventListener('scroll', updateAssignArrows); window.removeEventListener('resize', updateAssignArrows) }
  }, [updateAssignArrows])

  // Persist the chosen location across navigation within Inbox & CRM.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('colvy_location_filter')
      if (saved) setLocationFilter(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try { sessionStorage.setItem('colvy_location_filter', locationFilter) } catch {}
  }, [locationFilter])
  const [searchScope, setSearchScope] = useState<'all' | 'contact' | 'messages' | 'activity' | 'tasks' | 'notes' | 'ai'>('all')
  // Deep-search hits: conversation id → where it matched + a highlighted excerpt.
  const [searchMsgHits, setSearchMsgHits] = useState<Record<string, { field: string; snippet: string }>>({})
  const [msgSearch, setMsgSearch] = useState('')
  const [showMsgSearch, setShowMsgSearch] = useState(false)
  // Which match is currently focused (index into the ordered, top-down list of
  // matching messages) for the in-conversation find bar's next/previous nav.
  const [msgSearchIdx, setMsgSearchIdx] = useState(0)
  // Ordered (top-down / chronological, since `messages` is chronological) ids of
  // the messages whose body matches the in-conversation search.
  const msgMatchIds = useMemo(() => {
    const q = msgSearch.trim().toLowerCase()
    if (!q) return [] as string[]
    return messages.filter(m => (m.content || '').toLowerCase().includes(q)).map(m => String(m.id))
  }, [messages, msgSearch])
  // A new query starts from the first match.
  useEffect(() => { setMsgSearchIdx(0) }, [msgSearch])
  // Focus the active match: outline it and scroll it into view. Always clears the
  // previous highlight first, so closing the bar (or an empty query) leaves none.
  useEffect(() => {
    document.querySelectorAll('.cmsg-active-hit').forEach(n => n.classList.remove('cmsg-active-hit'))
    if (!showMsgSearch || msgMatchIds.length === 0) return
    const idx = Math.min(Math.max(0, msgSearchIdx), msgMatchIds.length - 1)
    const el = document.getElementById(`cmsg-${msgMatchIds[idx]}`)
    if (el) { el.classList.add('cmsg-active-hit'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
  }, [showMsgSearch, msgSearchIdx, msgMatchIds])
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false)
  // While the list folds open or shut its header is clipped, so nothing
  // spills over the conversations mid-animation.
  const [listAnim, setListAnim] = useState(false)
  const listAnimTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setSidebarCollapsed = (v: boolean) => {
    setSidebarCollapsedState(v); setListAnim(true)
    if (listAnimTimer.current) clearTimeout(listAnimTimer.current)
    listAnimTimer.current = setTimeout(() => setListAnim(false), 380)
  }
  // On phones we show one pane at a time: the conversation list, the open
  // thread, or the contact panel. Desktop shows all three side by side.
  const [mobilePane, setMobilePane] = useState<'list' | 'thread' | 'contact'>('list')
  // This person's private chat with Colvy (components/inbox/ColvyChat), pinned
  // at the top of the list. Open instead of a conversation, never alongside one.
  const colvy = useColvySummary(companyId)
  const [colvyOpen, setColvyOpen] = useState(false)
  // For the list refresh (below), which mustn't open a conversation over it.
  const colvyOpenRef = useRef(false)
  colvyOpenRef.current = colvyOpen
  // Tablets (768–1100px): the contact panel is a slide-over drawer, not a column.
  const [tabletContact, setTabletContact] = useState(false)
  useEffect(() => {
    if (!tabletContact) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTabletContact(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabletContact])
  const [isMobile, setIsMobile] = useState(false)
  const listCollapsed = sidebarCollapsed && !isMobile

  useEffect(() => {
    const check = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  // Phones put the thread first: the reply box starts as a one-line bar and
  // only opens into the full composer when tapped (see .mcmp-* in the styles).
  // It stays mounted while collapsed, so a half-written reply is kept. Desktop
  // ignores this and shows the composer as always.
  const [mComposerOpen, setMComposerOpen] = useState(false)
  // Phones: the thread header's tools (pin, assign, status, AI, products…) sit
  // in a tray under the name row, opened from its ⋯ button.
  const [mToolsOpen, setMToolsOpen] = useState(false)
  // The email composer's draft text, for the collapsed bar's preview.
  const [emailDraftText, setEmailDraftText] = useState('')
  const [replyChannel, setReplyChannel] = useState<'chat' | 'sms'>('chat')
  const [showSendMenu, setShowSendMenu] = useState(false)
  const [sendPicker, setSendPicker] = useState<'poll' | 'survey' | 'form' | 'payment' | null>(null)
  // Where a picked poll/survey/form goes: the email editor's insert, or the SMS/chat reply box.
  const pickerInsertRef = useRef<((t: string) => void) | null>(null)
  const [pickerItems, setPickerItems] = useState<any[]>([])
  const [payAmount, setPayAmount] = useState('')

  // ── Saved cards: save a card on file, then charge it later without asking ──
  const [showChargeCard, setShowChargeCard] = useState(false)
  // null while this conversation's cards are still loading.
  const [savedCards, setSavedCards] = useState<any[] | null>(null)
  // Cards already fetched, per conversation, so reopening is instant.
  const cardsByConv = useRef(new Map<string, any[]>())
  const cardsLoading = useRef(new Set<string>())   // a fetch is already on its way
  const [chargeAmount, setChargeAmount] = useState('')
  const [chargeDesc, setChargeDesc] = useState('')
  const [chargeCardId, setChargeCardId] = useState<string>('')
  const [charging, setCharging] = useState(false)

  // ── Product search ───────────────────────────────────────────────────────
  // Agents constantly get "how much is this?" — this looks the product up in
  // WooCommerce without leaving the chat, and sends the price or a buy link.
  const [showProducts, setShowProducts] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [productSearching, setProductSearching] = useState(false)
  const [productSent, setProductSent] = useState<string>('')
  const [productError, setProductError] = useState('')
  // The query the shown results belong to, so the panel can tell "no match"
  // apart from "still waiting for the search to start".
  const [productSearchedFor, setProductSearchedFor] = useState('')

  // ── Schedule a delivery from the chat ────────────────────────────────────
  // Books it into the team calendar so every outlet can see the run, and tells
  // the customer what window to expect.
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [schedule, setSchedule] = useState<any>({
    date: '', time_window: '', address: '', notes: '', location_id: '', notify: true,
  })
  const [outletsForSchedule, setOutletsForSchedule] = useState<any[]>([])
  // "Schedule message" — send the composed reply at a future time (cron delivers).
  const [showScheduleMsg, setShowScheduleMsg] = useState(false)
  const [scheduleMsgAt, setScheduleMsgAt] = useState('')
  const [schedulingMsg, setSchedulingMsg] = useState(false)
  // Replies scheduled on the open conversation, shown above the reply box so
  // they can be edited, sent now or cancelled.
  const [scheduledList, setScheduledList] = useState<any[]>([])
  const [editingScheduled, setEditingScheduled] = useState<{ id: string; message: string; at: string } | null>(null)
  const [scheduledBusy, setScheduledBusy] = useState('')
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selected?.id || null
  // Re-read a thread after an action and show it — only if that conversation is
  // still the one open. Sends take a few seconds and agents jump between chats;
  // without this check the previous chat's messages replaced the one just opened.
  const reloadThread = async (convId: string): Promise<boolean> => {
    const { data, since, fresh } = await fetchThread(convId)
    if (selectedIdRef.current !== convId) return false
    applyThread(convId, data || [], since, fresh)
    return true
  }
  // Re-read the open thread's LOADED WINDOW (everything from the oldest loaded
  // message onwards). For a conversation whose whole history is loaded this is
  // exactly the old full read.
  const fetchThread = async (convId: string): Promise<{ data: any[] | null; since: string | null; fresh?: boolean }> => {
    const win = threadWinRef.current
    // No window established for this conversation yet (its first page is still
    // loading) — read the newest page rather than the whole history.
    if (win.convId !== convId) {
      const { rows, since } = await fetchLatestPage(convId)
      return { data: rows, since, fresh: true }
    }
    const since = win.since
    let q = (supabase as any).from('messages').select('*').eq('conversation_id', convId)
    if (since) q = q.gte('created_at', since)
    const { data } = await q.order('created_at', { ascending: true })
    return { data: data || null, since }
  }
  // Swap in a re-read window. If older pages were prepended while that read was
  // in flight (the window start moved earlier), keep them rather than drop them.
  const applyThread = (convId: string, rows: any[], usedSince: string | null, fresh?: boolean) => {
    if (fresh) {
      if (threadWinRef.current.convId !== convId) setThreadWin({ convId, since: usedSince })
      else return   // the open's own first page landed meanwhile; it wins
    }
    setMessages(prev => {
      const win = threadWinRef.current
      if (usedSince && win.convId === convId && (!win.since || tsOf(win.since) < tsOf(usedSince))) {
        const cut = tsOf(usedSince)
        const have = new Set(rows.map((r: any) => r.id))
        return [...prev.filter((m: any) => tsOf(m.created_at) < cut && !have.has(m.id)), ...rows]
      }
      return rows
    })
  }
  // The newest page of a thread, oldest-first.
  const fetchLatestPage = async (convId: string): Promise<{ rows: any[]; since: string | null }> => {
    const { data } = await (supabase as any).from('messages').select('*').eq('conversation_id', convId)
      .order('created_at', { ascending: false }).limit(THREAD_PAGE)
    const rows = (data || []).slice().reverse()
    const since = (data || []).length >= THREAD_PAGE ? (rows[0]?.created_at ?? null) : null
    return { rows, since }
  }
  // Keep the viewport anchored on the same message when older pages are
  // prepended above it (applied in a layout effect once they're in the DOM).
  const prependAnchorRef = useRef<{ h: number; top: number } | null>(null)
  const lastThreadScrollTop = useRef(0)
  // Pull older history into the open thread: one page, or (all = true) the rest.
  const loadOlderMessages = async (all = false) => {
    const convId = selectedRef.current?.id
    const win = threadWinRef.current
    if (!convId || win.convId !== convId || !win.since || loadingOlderRef.current) return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    let stuck = false
    try {
      // lte (not lt): rows sharing the boundary timestamp may have been cut off
      // by the page limit; already-loaded ones are de-duplicated below.
      let q = (supabase as any).from('messages').select('*').eq('conversation_id', convId)
        .lte('created_at', win.since).order('created_at', { ascending: false })
      if (!all) q = q.limit(THREAD_PAGE + 1)
      const { data, error } = await q
      if (error || selectedRef.current?.id !== convId || threadWinRef.current.convId !== convId) return
      const rows = (data || []).slice().reverse()
      const more = !all && (data || []).length >= THREAD_PAGE + 1
      const since = more ? (rows[0]?.created_at ?? null) : null
      // Degenerate case: a whole page sharing one timestamp can't advance the
      // window — load everything instead (below).
      if (more && since === win.since) { stuck = true; return }
      const el = messagesScrollRef.current
      if (el) prependAnchorRef.current = { h: el.scrollHeight, top: el.scrollTop }
      setMessages(prev => {
        const have = new Set(prev.map((m: any) => m.id))
        return [...rows.filter((r: any) => !have.has(r.id)), ...prev]
      })
      setThreadWin({ convId, since })
    } finally {
      loadingOlderRef.current = false
      setLoadingOlder(false)
    }
    if (stuck) await loadOlderMessages(true)
  }
  useLayoutEffect(() => {
    const a = prependAnchorRef.current
    const el = messagesScrollRef.current
    if (!a || !el) return
    prependAnchorRef.current = null
    el.scrollTop = el.scrollHeight - a.h + a.top
  }, [messages])
  // In-thread search covers the whole conversation, as before: searching a
  // windowed thread pulls in the rest of its history first.
  useEffect(() => {
    if (!showMsgSearch || !msgSearch.trim()) return
    if (threadWin.since && threadWin.convId === selected?.id) loadOlderMessages(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMsgSearch, msgSearch, threadWin, selected?.id])
  // Remember the latest loaded thread so re-opening it paints instantly.
  useEffect(() => {
    const id = threadWin.convId
    if (!id || id !== selectedRef.current?.id || !messages.length) return
    threadCacheSet(id, { msgs: messages, since: threadWin.since })
  }, [messages, threadWin])
  // Gallery / "Shared media & files" source for a windowed thread: just the
  // attachment columns of the messages older than the window, loaded after the
  // thread has painted.
  useEffect(() => {
    const convId = threadWin.convId
    const since = threadWin.since
    if (!convId || !since) return
    // Already have everything before this window (an earlier read reached at
    // least this far forward)?
    if (olderMedia?.convId === convId && tsOf(since) <= tsOf(olderMedia.since)) return
    let cancelled = false
    const cols = 'id, conversation_id, created_at, attachments, email_attachments, gmail_message_id'
    const t = setTimeout(async () => {
      try {
        // Everything before the window that carries attachments. Rows that
        // later get paged into the window are de-duplicated in galleryMessages.
        let res = await (supabase as any).from('messages').select(cols).eq('conversation_id', convId)
          .lt('created_at', since).or('attachments.neq.[],email_attachments.neq.[]')
          .order('created_at', { ascending: true })
        if (res.error) {
          res = await (supabase as any).from('messages').select(cols).eq('conversation_id', convId)
            .lt('created_at', since).order('created_at', { ascending: true })
        }
        const rows = (res.data || []).filter((r: any) =>
          (Array.isArray(r.attachments) && r.attachments.length) || (Array.isArray(r.email_attachments) && r.email_attachments.length))
        if (!cancelled) setOlderMedia({ convId, since, rows })
      } catch {}
    }, 400)
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadWin.convId, threadWin.since])
  // Load them when a conversation opens, and keep checking while any are
  // waiting so ones the scheduler sends drop off the list on their own.
  useEffect(() => {
    const id = selected?.id
    setScheduledList([]); setEditingScheduled(null)
    if (!id) return
    loadScheduled(id)
    const iv = setInterval(() => { if (document.visibilityState === 'visible') loadScheduled(id) }, 60000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('company_locations')
        .select('id, label, suburb, is_primary').eq('company_id', companyId)
        .order('is_primary', { ascending: false })
      setOutletsForSchedule(data || [])
    })()
  }, [companyId])

  const openSchedule = () => {
    // Sensible defaults: tomorrow, and the customer's address if we know it.
    const t = new Date(); t.setDate(t.getDate() + 1)
    setSchedule({
      date: t.toISOString().slice(0, 10),
      time_window: '',
      address: contact?.address || '',
      notes: '',
      location_id: (selected as any)?.assigned_location_id || outletsForSchedule[0]?.id || '',
      notify: true,
    })
    setShowSchedule(true)
  }

  // Schedule the currently-composed reply to be sent later. Defaults to one hour
  // from now; the /api/cron/send-scheduled worker delivers it on the
  // conversation's channel when the time arrives.
  const openScheduleMsg = () => {
    if (!reply.trim()) { showToast('Type a message first, then schedule it.'); return }
    const t = new Date(Date.now() + 60 * 60 * 1000)
    // datetime-local wants local wall-clock, so offset out the timezone.
    const local = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    setScheduleMsgAt(local)
    setShowScheduleMsg(true)
  }

  const loadScheduled = async (convId?: string | null) => {
    if (!convId) { setScheduledList([]); return }
    try {
      const r = await authFetch(`/api/inbox/scheduled?conversationId=${convId}`)
      const d = await r.json().catch(() => ({}))
      if (r.ok && selectedIdRef.current === convId) setScheduledList(d.scheduled || [])
    } catch {}
  }
  // Wall-clock value for a datetime-local input.
  const toLocalInput = (iso: string) => { const t = new Date(iso); return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
  const scheduledWhen = (iso: string) => {
    const t = new Date(iso), now = new Date()
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const diff = Math.round((day(t) - day(now)) / 864e5)
    const time = t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    if (diff === 0) return `Today, ${time}`
    if (diff === 1) return `Tomorrow, ${time}`
    return `${t.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
  }
  const saveScheduledEdit = async () => {
    if (!editingScheduled || scheduledBusy) return
    const when = new Date(editingScheduled.at)
    if (!editingScheduled.message.trim()) { showToast('The message can’t be empty.'); return }
    if (isNaN(when.getTime())) { showToast('Pick a valid date and time.'); return }
    if (when.getTime() < Date.now() + 30000) { showToast('Pick a time in the future.'); return }
    setScheduledBusy(editingScheduled.id)
    try {
      const r = await authFetch('/api/inbox/scheduled', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingScheduled.id, message: editingScheduled.message, scheduledFor: when.toISOString() }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not save')
      setEditingScheduled(null)
      showToast(`Rescheduled for ${scheduledWhen(when.toISOString())}`)
    } catch (e: any) { showToast(e?.message || 'Could not save') }
    finally { setScheduledBusy(''); loadScheduled(selected?.id) }
  }
  const sendScheduledNow = async (sm: any) => {
    if (scheduledBusy) return
    setScheduledBusy(sm.id)
    try {
      const r = await authFetch('/api/inbox/scheduled', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sm.id, action: 'send-now' }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not send')
      setEditingScheduled(e => (e?.id === sm.id ? null : e))
      showToast('Sent')
    } catch (e: any) { showToast(e?.message || 'Could not send') }
    finally { setScheduledBusy(''); loadScheduled(selected?.id) }
  }
  const deleteScheduled = async (sm: any) => {
    if (scheduledBusy) return
    if (!await confirmDialog({ title: 'Delete scheduled message?', message: `It won’t be sent${sm.scheduled_for ? ` on ${scheduledWhen(sm.scheduled_for)}` : ''}.`, confirmLabel: 'Delete', tone: 'danger' })) return
    setScheduledBusy(sm.id)
    try {
      const r = await authFetch(`/api/inbox/scheduled?id=${sm.id}`, { method: 'DELETE' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not delete')
      setScheduledList(list => list.filter(x => x.id !== sm.id))
      setEditingScheduled(e => (e?.id === sm.id ? null : e))
      showToast('Scheduled message deleted')
    } catch (e: any) { showToast(e?.message || 'Could not delete') }
    finally { setScheduledBusy(''); loadScheduled(selected?.id) }
  }

  const scheduleMessage = async () => {
    if (!selected || !user || schedulingMsg) return
    const content = reply.trim()
    if (!content) { showToast('Type a message first.'); return }
    const when = scheduleMsgAt ? new Date(scheduleMsgAt) : null
    if (!when || isNaN(when.getTime())) { showToast('Pick a valid date and time.'); return }
    if (when.getTime() < Date.now() + 30000) { showToast('Pick a time in the future.'); return }
    setSchedulingMsg(true)
    try {
      const { error } = await (supabase as any).from('scheduled_messages').insert({
        company_id: companyId,
        conversation_id: selected.id,
        contact_id: (selected as any).contact_id || contact?.id || null,
        message: content,
        scheduled_for: when.toISOString(),
        channel: sendChannel !== 'auto' ? sendChannel : ((selected as any).channel || 'chat'),
        status: 'pending',
        type: 'message',
        created_by: user.id,
      })
      if (error) throw error
      setShowScheduleMsg(false)
      draft.discard()
      if (selectedIdRef.current === selected.id) { setReply(''); setReplyTo(null) }
      showToast(`Message scheduled for ${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`)
      loadScheduled(selected.id)
    } catch (e: any) {
      showToast('Could not schedule: ' + (e?.message || 'error'))
    } finally {
      setSchedulingMsg(false)
    }
  }

  const saveSchedule = async () => {
    if (!companyId || !selected || !schedule.date) return
    setScheduling(true)
    try {
      const who = contact?.name || contact?.email || 'customer'
      const res = await authFetch('/api/calendar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          event_type: 'delivery',
          title: `Delivery — ${who}`,
          notes: schedule.notes || null,
          starts_at: new Date(`${schedule.date}T09:00:00`).toISOString(),
          is_all_day: true,           // the window is what matters, not a clock time
          time_window: schedule.time_window || null,
          location_id: schedule.location_id || null,
          contact_id: contact?.id || null,
          conversation_id: selected.id,
          address: schedule.address || null,
          status: 'scheduled',
          created_by: user?.id,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not schedule')

      // Tell the customer what to expect.
      if (schedule.notify) {
        const when = new Date(schedule.date).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        const text = `Your delivery is booked for ${when}${schedule.time_window ? `, between ${schedule.time_window}` : ''}.${schedule.address ? `\nAddress: ${schedule.address}` : ''}\nWe'll let you know when it's on its way.`
        const me = myName
        const smsNumber = smsDestination()

        if (smsNumber) {
          try {
            await authFetch('/api/telnyx/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text, senderName: me, skipChatMessage: true }),
            })
          } catch {}
        }

        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId,
          sender_type: 'agent', sender_id: user?.id, sender_name: me,
          content: text, message_type: 'text',
          metadata: { delivery_scheduled: true },
          delivery_channel: smsNumber ? 'sms' : 'chat',
        })
        await (supabase as any).from('conversations').update({
          last_message: text.split('\n')[0], last_message_at: new Date().toISOString(),
        }).eq('id', selected.id)
      }

      setShowSchedule(false)
      await reloadThread(selected.id)
      loadConversationExtras(selected.id)
      scrollBottom()
      showToast('Delivery scheduled — it\'s on the team calendar')
    } catch (e: any) {
      showToast('Could not schedule: ' + e.message)
    } finally {
      setScheduling(false)
    }
  }

  const searchProducts = async () => {
    if (!companyId || !productQuery.trim()) return
    if (productQuery.trim().length < 2) { setProductError('Type at least 2 characters.'); return }
    const asked = productQuery.trim()
    setProductSearching(true)
    setProductError('')
    try {
      // stores=1: each product's stock at each store, where that's set up.
      const res = await authFetch(`/api/orders/products?companyId=${companyId}&q=${encodeURIComponent(productQuery.trim())}&stores=1`)
      const d = await res.json()
      if (!res.ok) {
        // Say WHY instead of silently showing "no products found".
        setProductError(d.error || 'Product search failed.')
        setProducts([])
        return
      }
      setProducts(d.products || [])
      if (!(d.products || []).length) setProductError('')
    } catch (e: any) {
      setProductError('Could not reach the store: ' + (e?.message || 'network error'))
      setProducts([])
    }
    finally { setProductSearching(false); setProductSearchedFor(asked) }
  }

  // Live search — run the lookup as the agent types (debounced), so results
  // appear without pressing Search. The button still works for an instant run.
  useEffect(() => {
    if (!showProducts) return
    const q = productQuery.trim()
    if (q.length < 2) { setProducts([]); setProductError(''); return }
    const t = setTimeout(() => { searchProducts() }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productQuery, showProducts, companyId])

  // Post a message about the product into the chat (and out over SMS if that's
  // how we're talking to them).
  const sendProductMessage = async (p: any, kind: 'price' | 'link' | 'both') => {
    if (!selected || !companyId || !user) return
    const rawPrice = p.sale_price && p.on_sale ? p.sale_price : (p.price || p.regular_price)
    // WooCommerce returns prices like "2.9900" — show Australian currency
    // formatting ($2.99) rather than the raw 4-decimal value.
    const price = new Intl.NumberFormat('en-AU', {
      style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol',
    }).format(Number(rawPrice) || 0)
    const stock = p.stock_status === 'instock'
      ? (p.manage_stock && p.stock_quantity != null ? `${p.stock_quantity} in stock` : 'In stock')
      : 'Out of stock'

    // Rewrite the product URL to a trackable company.colvy.com link so we can
    // report on whether the customer opened it. Falls back to the raw permalink.
    let productUrl = p.permalink || ''
    if (productUrl) {
      try {
        const r = await authFetch('/api/short-links/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, kind: 'redirect', conversationId: selected.id, url: productUrl }),
        })
        const d = await r.json()
        if (r.ok && d.url) productUrl = d.url
      } catch { /* keep the original link */ }
    }

    let content = ''
    if (kind === 'price') {
      content = `${p.name} — ${price} AUD (${stock})`
    } else if (kind === 'link') {
      content = `${p.name}\n${productUrl}`
    } else {
      content = `${p.name} — ${price} AUD (${stock})\n${productUrl}`
    }

    const me = myName
    const smsNumber = smsDestination()

    try {
      // Shorten the product link for SMS so it isn't a huge ugly URL.
      let smsText = content
      if (smsNumber) {
        const r = await authFetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, conversationId: selected.id, to: smsNumber,
            text: smsText, senderName: me, skipChatMessage: true,
          }),
        })
        const rd = await r.json()
        if (!r.ok) showToast(`Sent in chat, but the SMS failed: ${rd.error || 'unknown error'}`)
      }

      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId,
        sender_type: 'agent', sender_id: user.id, sender_name: me, sender_email: user.email,
        content,
        message_type: 'product',
        message_payload: {
          kind: 'product',
          id: p.id, name: p.name, sku: p.sku,
          price: rawPrice, price_display: price, currency: 'AUD', on_sale: !!p.on_sale, regular_price: p.regular_price,
          stock_status: p.stock_status, stock_quantity: p.stock_quantity,
          image: p.image, permalink: productUrl, source_url: p.permalink,
          shown: kind,
        },
        delivery_channel: smsNumber ? 'sms' : 'chat',
      })

      await (supabase as any).from('conversations').update({
        last_message: content.split('\n')[0], last_message_at: new Date().toISOString(),
      }).eq('id', selected.id)

      await reloadThread(selected.id)
      scrollBottom()
      setProductSent(`${p.id}-${kind}`)
      setTimeout(() => setProductSent(''), 1800)
    } catch (e: any) {
      showToast('Could not send the product: ' + e.message)
    }
  }

  // ── Quick responses (Time Savers) ────────────────────────────────────────
  // Typing "/" in the composer offers saved replies; picking one (or typing its
  // shortcut and pressing Tab/Enter) expands it. Previously these were saved in
  // settings but the composer ignored them, so "/hours" sent as literal text.
  const [quickResponses, setQuickResponses] = useState<any[]>([])
  const [showQuickMenu, setShowQuickMenu] = useState(false)
  const [quickIndex, setQuickIndex] = useState(0)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('quick_responses')
        .select('*').eq('company_id', companyId).order('created_at', { ascending: true })
      setQuickResponses(data || [])
    })()
  }, [companyId])

  // Which saved replies match what's been typed after the "/"?
  const quickMatches = (() => {
    const m = reply.match(/(?:^|\s)\/([\w-]*)$/)
    if (!m) return []
    const q = (m[1] || '').toLowerCase()
    return quickResponses.filter(r => {
      const sc = (r.shortcut || '').replace(/^\//, '').toLowerCase()
      const title = (r.title || '').toLowerCase()
      return !q || sc.startsWith(q) || title.includes(q)
    })
  })()

  useEffect(() => {
    setShowQuickMenu(quickMatches.length > 0)
    setQuickIndex(0)
  }, [reply])

  const applyQuickResponse = (r: any) => {
    // Replace the trailing "/shortcut" with the saved body.
    setReply(prev => prev.replace(/(?:^|\s)\/[\w-]*$/, (match) => {
      const lead = match.startsWith(' ') ? ' ' : ''
      return lead + fillTemplateVars(r.body || '', templateVars)
    }))
    setShowQuickMenu(false)
  }

  // ── Live typing preview (ADMIN ONLY) ──────────────────────────────────────
  // See what the customer is typing before they send it, so agents can prepare.
  // The customer is never shown the agent's draft — this is one-way.
  // We ALSO surface when another agent is typing in the same thread, so two
  // agents don't reply over each other.
  const [liveTyping, setLiveTyping] = useState<string>('')
  const [agentTyping, setAgentTyping] = useState<string | null>(null)
  const typingChanRef = useRef<any>(null)
  const agentTypingClearRef = useRef<any>(null)
  // Exclude our OWN typing by a per-session id, not by name — otherwise the same
  // agent signed in on two devices (e.g. web + phone) would hide each other's
  // typing, which is exactly the case when testing.
  const mySidRef = useRef(Math.random().toString(36).slice(2))
  const myTypingName = myName
  useEffect(() => {
    if (!selected?.id) { setLiveTyping(''); setAgentTyping(null); return }
    setLiveTyping(''); setAgentTyping(null)
    const ch = supabase.channel(`typing-${selected.id}`)
    typingChanRef.current = ch
    ch.on('broadcast', { event: 'typing' }, (msg: any) => {
      const p = msg?.payload
      if (!p) return
      if (p.from === 'visitor') { setLiveTyping(p.text || ''); return }
      if (p.from === 'agent' && p.name && p.sid !== mySidRef.current) {
        if (p.stopped) { setAgentTyping(null); return }
        setAgentTyping(p.name)
        if (agentTypingClearRef.current) clearTimeout(agentTypingClearRef.current)
        agentTypingClearRef.current = setTimeout(() => setAgentTyping(null), 4000)
      }
    }).subscribe()
    // Clear the preview if they go quiet.
    const idle = setInterval(() => setLiveTyping(t => t), 1000)
    return () => {
      supabase.removeChannel(ch); typingChanRef.current = null; clearInterval(idle)
      if (agentTypingClearRef.current) clearTimeout(agentTypingClearRef.current)
    }
  }, [selected?.id, myTypingName])

  // Tell other agents (and the customer's widget) that this agent is typing.
  const lastTypingSentRef = useRef(0)
  const typingStopRef = useRef<any>(null)
  const broadcastAgentTyping = () => {
    const ch = typingChanRef.current
    if (!ch || !selected?.id) return
    const now = Date.now()
    if (now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now
      ch.send({ type: 'broadcast', event: 'typing', payload: { from: 'agent', name: myTypingName, sid: mySidRef.current } })
    }
    if (typingStopRef.current) clearTimeout(typingStopRef.current)
    typingStopRef.current = setTimeout(() => {
      ch.send({ type: 'broadcast', event: 'typing', payload: { from: 'agent', name: myTypingName, sid: mySidRef.current, stopped: true } })
      lastTypingSentRef.current = 0
    }, 3000)
  }

  const cardsApi = async (body: any) => {
    const res = await authFetch('/api/stripe/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, conversationId: selected?.id, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }

  // Fetches the customer's saved cards. Opening the "+" menu starts this, so
  // they're usually here by the time Charge Card is clicked; a conversation
  // already looked at shows its cards straight away and refreshes quietly.
  const loadSavedCards = async () => {
    if (!selected || !companyId) return
    const convId = selected.id
    const show = (cards: any[]) => {
      setSavedCards(cards)
      setChargeCardId(id => cards.some(c => c.id === id) ? id : (cards[0]?.id || ''))
    }
    const cached = cardsByConv.current.get(convId)
    if (cached) show(cached); else setSavedCards(null)
    if (cardsLoading.current.has(convId)) return
    cardsLoading.current.add(convId)
    try {
      const d = await cardsApi({ action: 'list_cards' })
      cardsByConv.current.set(convId, d.cards || [])
      if (selectedIdRef.current === convId) show(d.cards || [])
    } catch { if (!cached && selectedIdRef.current === convId) setSavedCards([]) }
    finally { cardsLoading.current.delete(convId) }
  }

  // Sends the customer a secure Stripe page to store their card.
  const saveCard = async () => {
    if (!selected || !companyId) return
    // It messages the customer, so confirm first (no toolbar item sends on one click).
    if (!await confirmDialog({ title: 'Send a card-save link?', message: 'The customer gets a secure Stripe link to save their card.', confirmLabel: 'Send link', tone: 'primary' })) return
    try {
      const via = composeChannel()
      const isWidgetActive = via === 'widget' || via === 'chat'
      const d = await cardsApi({ action: 'save_card', channel: isWidgetActive ? 'chat' : via })
      // Off-site (SMS/email/Messenger): the in-chat card can't be tapped, so send
      // the secure save-card link over the real channel. `silent` = the card is
      // already the thread record (correct delivery_channel), no duplicate.
      if (d?.url && !isWidgetActive) {
        try {
          await deliverToCustomer({
            subject: `${companyInfo?.name || 'We'} — save your card securely`,
            body: 'Please save your card securely with Stripe — we\'ll never see your card details:',
            url: d.url, silent: true,
          })
        } catch (e: any) { showToast(`Saved, but sending failed: ${e.message}`) }
      }
      await reloadThread(selected.id)
      scrollBottom()
      showToast('Card-save link sent to the customer')
    } catch (e: any) {
      showToast(e.message)
    }
  }

  // Charges a card the customer already saved.
  const chargeCard = async () => {
    if (!selected || !companyId || !chargeAmount) return
    setCharging(true)
    try {
      const d = await cardsApi({ action: 'charge_card', amount: chargeAmount, description: chargeDesc, cardId: chargeCardId || undefined })
      setShowChargeCard(false); setChargeAmount(''); setChargeDesc('')
      await reloadThread(selected.id)
      scrollBottom()
      showToast(d.paid ? 'Card charged successfully' : `Charge status: ${d.status}`)
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setCharging(false)
    }
  }
  const [payDesc, setPayDesc] = useState('')
  // Address the pay link asks for; null = the business default (Settings → Payments).
  const [payAddress, setPayAddress] = useState<'none' | 'billing' | 'shipping' | null>(null)
  const [toast, setToast] = useState('')
  const [editField, setEditField] = useState<string | null>(null)
  const [editFieldValue, setEditFieldValue] = useState('')
  // Message ids currently showing the ORIGINAL (untranslated) text — the default
  // is the English translation for a non-English inbound message.
  const [showOriginalMsgs, setShowOriginalMsgs] = useState<Set<string>>(new Set())
  // Flagged messages (conversation protection) someone chose to look at.
  const [revealedMsgs, setRevealedMsgs] = useState<Set<string>>(new Set())
  const [protectionBusy, setProtectionBusy] = useState(false)
  const toggleMsgOriginal = (id: string) => setShowOriginalMsgs(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  // Translate one message into English on demand (emails, older messages,
  // ones the automatic check missed); saved on the message for everyone.
  const [translatingMsgs, setTranslatingMsgs] = useState<Set<string>>(new Set())
  const translateMsg = async (id: string) => {
    if (!companyId || translatingMsgs.has(id)) return
    setTranslatingMsgs(p => new Set(p).add(id))
    try {
      const r = await authFetch('/api/inbox/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, messageId: id }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { showToast(d.error || 'Couldn’t translate that message.'); return }
      setMessages(prev => prev.map(m => m.id === id ? ({ ...m, content_lang: d.lang || 'unknown', ...(d.translated ? { translated_content: d.translated } : {}) } as any) : m))
      if (!d.translated) showToast('That message is already in English.')
    } catch { showToast('Couldn’t translate that message.') } finally { setTranslatingMsgs(p => { const n = new Set(p); n.delete(id); return n }) }
  }
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open')

  // ── Filter panel (Coax style) ─────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const [showDialer, setShowDialer] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [showTracking, setShowTracking] = useState(false)
  const [emailFromLabel, setEmailFromLabel] = useState('')
  const [linkedChannels, setLinkedChannels] = useState<any[]>([])
  const [showTimeline, setShowTimeline] = useState(false)
  const [emailSignature, setEmailSignature] = useState<string | null>(null)

  // Is the visitor on the page RIGHT NOW? The widget heartbeats page_seen_at
  // every 60s while their tab is open. Fresh (< 2 min) ⇒ show the live banner;
  // stale ⇒ they've left, so the page belongs in history, not in a banner
  // claiming they're "currently on" it. Re-checked every 20s so a banner for
  // someone who just left disappears on its own. (The same 2 minutes as
  // LIVE_ON_PAGE_MS in lib/channel-choice.)
  const [nowTick, setNowTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setNowTick(t => t + 1), 20000)
    return () => clearInterval(iv)
  }, [])
  const isOnPageNow = useMemo(() => {
    const seen = (selected as any)?.page_seen_at
    if (!seen) return false
    const p = parseTs(seen)
    return p ? (Date.now() - p.getTime()) < 120000 : false
  }, [selected?.id, (selected as any)?.page_seen_at, nowTick])

  // The shared channel rule's answer for this thread (/api/inbox/channel-choice,
  // lib/channel-choice): used when the customer hasn't messaged on it yet, and
  // for where an email reply comes back to. smsOptIn false: a website chat
  // visitor who didn't tick "Continue this conversation by text".
  const [channelPick, setChannelPick] = useState<{ convId: string; channel: string; reason?: string; replyTo?: string | null; smsOptIn?: boolean | null } | null>(null)
  // Has the customer written on this thread at all (any channel)?
  const customerSpoke = useMemo(() => messages.some((m: any) => m && m.sender_type !== 'agent' && m.sender_type !== 'system' && !m.is_internal), [messages])

  // Where is this customer ACTUALLY talking, right now? The conversation's
  // stored channel goes stale the moment someone moves from the web widget to
  // SMS, which is why threads kept insisting they were "live chat" (and kept
  // showing the web page the customer was supposedly "currently on" — data from
  // a visit that may have ended days ago). The newest message wins.
  const activeChannel = useMemo(() => {
    // INBOUND first. Taking the newest delivery_channel of ANY message lets one
    // reply sent on the wrong channel redefine the thread permanently: a single
    // SMS into a Messenger conversation makes 'sms' the newest channel, so the
    // next reply goes by SMS too, and so on. It is self-reinforcing, and it
    // crosses clients — a mobile reply did exactly this to a Messenger thread
    // and the web then inherited SMS from it. What decides a reply is the
    // channel the CUSTOMER last used; our own past choices are the thing under
    // suspicion, so they cannot be the evidence.
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as any
      if (!m || m.sender_type === 'agent' || m.sender_type === 'system' || m.is_internal) continue
      const dc = String(m.delivery_channel || '').toLowerCase()
      if (dc && dc !== 'chat') return dc
    }
    // The customer hasn't messaged on this thread (an order or cart thread of
    // Colvy's own messages): the shared rule decides — their last channel
    // elsewhere, else SMS when they may be texted, else email. Our own last
    // outbound channel is not evidence (an order email made every reply email).
    if (!customerSpoke && channelPick && channelPick.convId === selected?.id && channelPick.channel && channelPick.channel !== 'none') return channelPick.channel
    // Nothing inbound carried one — fall back to any message, then the row.
    for (let i = messages.length - 1; i >= 0; i--) {
      const dc = String((messages[i] as any).delivery_channel || '').toLowerCase()
      if (dc && dc !== 'chat') return dc
    }
    return String((selected as any)?.channel || 'widget').toLowerCase()
  }, [messages, selected?.id, (selected as any)?.channel, channelPick, customerSpoke])

  const isWebChat = ['widget', 'chat'].includes(activeChannel)
  // Where a reply or an action (payment link, coupon, form…) actually goes. A
  // phone-call thread has no text channel of its own, so we text the caller
  // (or email them if there's no mobile) instead of treating it as live chat.
  const outboundChannel = useMemo(() => {
    // A Colvy chat is answered in the app only (see sendReply).
    if (String((selected as any)?.channel || '') === 'colvy') return 'colvy'
    if (!['phone', 'call', 'voice'].includes(activeChannel)) return activeChannel
    const s = selected as any
    if (s?.sms_number || s?.phone || contact?.phone || s?.contacts?.phone) return 'sms'
    if (contact?.email || s?.customer_email) return 'email'
    return 'chat'
  }, [activeChannel, selected, contact?.phone, contact?.email])
  // The channel the composer shows ("Sending by …"): the one picked with
  // "Use email" / "Use SMS", else the automatic choice. Everything the
  // composer sends — polls, payment links, card-save links — goes this way.
  const composeChannel = (): string => (sendChannel !== 'auto' ? sendChannel : outboundChannel)

  // Has the customer on this SMS thread opted out of texts? Asked of the server
  // (/api/inbox/text-optout: every contact with the number, and STOPs that never
  // reached a contact), not just this contact's flags, so the warning above the
  // composer doesn't miss anyone. Checked again when a new message comes in.
  const [smsOptOut, setSmsOptOut] = useState<string | null>(null)
  const lastInboundId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if ((messages[i] as any)?.sender_type === 'visitor') return (messages[i] as any).id || null
    return null
  }, [messages])
  useEffect(() => {
    setSmsOptOut(null)
    // Also asked whenever there's a mobile on file (not only on SMS threads),
    // so the review request names the right channel.
    const hasMobile = !!((selected as any)?.sms_number || (selected as any)?.phone || contact?.phone)
    if (!selected?.id || (outboundChannel !== 'sms' && !hasMobile)) return
    let cancelled = false
    authFetch(`/api/inbox/text-optout?conversationId=${encodeURIComponent(selected.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setSmsOptOut(d?.state || null) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selected?.id, outboundChannel, lastInboundId, contact?.phone])
  useEffect(() => {
    if (!selected?.id) return
    let cancelled = false
    const convId = selected.id
    authFetch(`/api/inbox/channel-choice?conversationId=${encodeURIComponent(convId)}`)
      .then(r => r.ok ? r.json() : null)
      // A failed lookup still counts as answered (channel ''), so the composer
      // falls back to the thread's own channel instead of waiting.
      .then(d => { if (!cancelled) setChannelPick({ convId, channel: d?.channel || '', reason: d?.reason, replyTo: d?.replyTo || null, smsOptIn: typeof d?.smsOptIn === 'boolean' ? d.smsOptIn : null }) })
      .catch(() => { if (!cancelled) setChannelPick({ convId, channel: '' }) })
    return () => { cancelled = true }
    // Asked again when a website chat visitor arrives or leaves (live chat while they're there).
  }, [selected?.id, lastInboundId, isOnPageNow])

  // The name shown in the conversation header. On SMS/phone the "subject" is
  // often a stale auto-detected name (e.g. from an AI guess), so clearing the
  // contact's name left the wrong name stuck in the header. Don't use the
  // subject as a person's name on those channels — fall back to Visitor, matching
  // the info panel. Web/email subjects are real titles, so keep them there.
  const nameFromSubject = ['sms', 'phone', 'voice'].includes(activeChannel) ? null : (selected as any)?.subject
  // No saved contact on a text/call thread → show the number, not "Visitor".
  const threadNumber: string | null = (selected as any)?.sms_number || null
  const headerName = contact?.name || nameFromSubject || (contact ? null : threadNumber) || contact?.phone || 'Visitor'

  // Is a payment in this thread still awaiting settlement?
  const hasPendingPayment = useMemo(
    () => messages.some((m: any) => m.message_type === 'payment' && m.message_payload?.status && m.message_payload.status !== 'paid'),
    [messages]
  )

  // While a payment is pending in the OPEN conversation, reconcile it straight
  // from Stripe every ~12s (verify-payment doesn't rely on the webhook). The
  // moment it settles, the card flips to PAID and the "Payment received" line
  // appears — no manual reload needed. Stops as soon as nothing is pending.
  useEffect(() => {
    if (!hasPendingPayment || !selected?.id || !companyId) return
    const convId = selected.id
    let stopped = false
    const tick = async () => {
      try {
        const r = await authFetch('/api/stripe/verify-payment', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: convId, companyId }),
        })
        const d = await r.json().catch(() => ({}))
        if (!stopped && d?.updated > 0 && selectedRef.current?.id === convId) {
          const { data, since, fresh } = await fetchThread(convId)
          if (data && selectedRef.current?.id === convId) applyThread(convId, data, since, fresh)
        }
      } catch { /* keep polling */ }
    }
    const iv = setInterval(tick, 12000)
    return () => { stopped = true; clearInterval(iv) }
  }, [hasPendingPayment, selected?.id, companyId])

  // Load this contact's linked channels (same person across live chat / SMS /
  // Messenger / IG / WooCommerce) for the sidebar's "also reachable on" panel.
  useEffect(() => {
    const cid = contact?.id
    if (!cid) { setLinkedChannels([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await authFetch(`/api/contacts/linked?contactId=${cid}`)
        const d = await res.json()
        if (!cancelled) setLinkedChannels(d.channels || [])
      } catch { if (!cancelled) setLinkedChannels([]) }
    })()
    return () => { cancelled = true }
  }, [contact?.id])

  // For an email thread, load the sending mailbox so the composer can show the
  // real "From" and append the right signature.
  useEffect(() => {
    // Any thread can be replied to by email (an order thread, or "Use email"),
    // so the mailbox is loaded for every conversation, not just email ones.
    if (!selected) {
      setEmailFromLabel(''); setEmailSignature(null); return
    }
    let cancelled = false
    ;(async () => {
      let ch: any = null
      const chId = (selected as any).email_channel_id
      if (chId) {
        const { data } = await (supabase as any).from('email_channels').select('*').eq('id', chId).maybeSingle()
        ch = data
      }
      if (!ch && companyId) {
        const { data } = await (supabase as any).from('email_channels').select('*')
          .eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
        ch = data?.[0]
      }
      if (cancelled || !ch) return
      const name = ch.from_name || companyInfo?.name || 'Support'
      setEmailFromLabel(`${name} <${ch.inbound_address || ch.from_address}>`)
      setEmailSignature(ch.signature || null)
    })()
    return () => { cancelled = true }
  }, [selected?.id, (selected as any)?.channel, (selected as any)?.email_channel_id, companyId])

  const [showPod, setShowPod] = useState(false)
  const [podNote, setPodNote] = useState('')
  const [podFiles, setPodFiles] = useState<File[]>([])
  const [podSending, setPodSending] = useState(false)
  const [showDeliveryPanel, setShowDeliveryPanel] = useState(false)
  const [filters, setFilters] = useState<any>({
    dateFrom: '', dateTo: '', channel: '', assignedTo: '', source: '', relationship: '', purchased: '', orderStatus: '', oldestFirst: false,
  })
  const activeFilterCount = ['dateFrom', 'dateTo', 'channel', 'assignedTo', 'source', 'relationship', 'purchased', 'orderStatus']
    .filter(k => filters[k]).length + (filters.oldestFirst ? 1 : 0)
  // The filter sheet's Custom date range is open (it also opens on its own for a range that isn't a preset).
  const [filtersCustomDates, setFiltersCustomDates] = useState(false)
  const resetFilters = () => setFilters({ dateFrom: '', dateTo: '', channel: '', assignedTo: '', source: '', relationship: '', purchased: '', orderStatus: '', oldestFirst: false })
  // Purchase-history lookup for the "Purchased (SKU or title)" filter, keyed by
  // lowercased contact email (a contact's orders live in woocommerce_customers,
  // not on the conversation). Loaded lazily only when that filter is in use, and
  // cached per company so switching filters doesn't refetch.
  const [wooItemsMap, setWooItemsMap] = useState<Map<string, any[]>>(new Map())
  const wooItemsRef = useRef<{ companyId: string; map: Map<string, any[]> } | null>(null)
  const [showAssignMenu, setShowAssignMenu] = useState(false)
  const [showStatusMenu, setShowStatusMenu] = useState(false)  // the list's Open / Closed menu

  // Load the email → purchased-items map when (and only when) the Purchased
  // filter is active. Mirrors the Contacts page enrichment source.
  useEffect(() => {
    if (!filters.purchased?.trim() || !companyId) return
    if (wooItemsRef.current?.companyId === companyId) { setWooItemsMap(wooItemsRef.current.map); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await (supabase as any)
          .from('woocommerce_customers').select('email, items_purchased').eq('company_id', companyId).limit(5000)
        const m = new Map<string, any[]>()
        for (const c of data || []) {
          if (!c.email) continue
          let ip = c.items_purchased
          if (typeof ip === 'string') { try { ip = JSON.parse(ip) } catch { ip = [ip] } }
          m.set(String(c.email).toLowerCase(), Array.isArray(ip) ? ip : [])
        }
        if (!cancelled) { wooItemsRef.current = { companyId, map: m }; setWooItemsMap(m) }
      } catch (e) { console.error('inbox purchased-filter load failed', e) }
    })()
    return () => { cancelled = true }
  }, [filters.purchased, companyId])

  // Does this contact's purchase history include something matching the query
  // (by SKU or product title)?
  const purchasedMatches = (email: string | undefined, query: string) => {
    const items = wooItemsMap.get((email || '').toLowerCase())
    if (!items || !items.length) return false
    const q = query.trim().toLowerCase()
    return items.some((it: any) => typeof it === 'string'
      ? it.toLowerCase().includes(q)
      : String(it.sku || '').toLowerCase().includes(q) || String(it.name || it.title || '').toLowerCase().includes(q))
  }

  // Order-status filter: keep conversations whose contact has at least one order
  // in the chosen WooCommerce status (order placed / processing / completed /
  // refunded / failed …). Keyed by lowercased contact email against the orders
  // table; loaded lazily only when the filter is in use and cached per company +
  // status. We fetch the set of customer emails that have an order IN THE CHOSEN
  // status — scoped server-side and newest-first — rather than pulling the whole
  // orders table and grouping client-side. The old approach capped an UNordered
  // full-table read at 8000 rows: on a store with tens of thousands of orders
  // that slice held the oldest rows and almost never the (recent) orders in the
  // status being filtered, so the filter matched nothing.
  const [orderStatusEmails, setOrderStatusEmails] = useState<Set<string>>(new Set())
  const orderStatusRef = useRef<{ companyId: string; status: string; emails: Set<string> } | null>(null)
  useEffect(() => {
    if (!filters.orderStatus || !companyId) { setOrderStatusEmails(new Set()); return }
    const status = filters.orderStatus
    if (orderStatusRef.current?.companyId === companyId && orderStatusRef.current?.status === status) {
      setOrderStatusEmails(orderStatusRef.current.emails); return
    }
    let cancelled = false
    ;(async () => {
      try {
        const emails = new Set<string>()
        // Primary: the server endpoint reads the synced table AND queries
        // WooCommerce live, so it still finds orders that were never synced
        // (which is why "Processing" used to show nothing on some stores).
        try {
          const res = await authFetch(`/api/orders/emails-by-status?companyId=${encodeURIComponent(companyId)}&status=${encodeURIComponent(status)}`)
          if (res.ok) { const d = await res.json(); for (const e of (d.emails || [])) emails.add(String(e).toLowerCase()) }
        } catch { /* fall back to the direct read below */ }

        // Fallback: read the synced woocommerce_orders table directly. Woo stores
        // the status bare ("processing") or wc-prefixed ("wc-processing")
        // depending on the sync path — match both.
        if (emails.size === 0) {
          const statusVals = status === 'pending'
            ? ['pending', 'wc-pending', 'checkout-draft', 'wc-checkout-draft']
            : [status, `wc-${status}`]
          const PAGE = 1000
          for (let from = 0; from < 20000; from += PAGE) {
            const { data, error } = await (supabase as any).from('woocommerce_orders')
              .select('customer_email')
              .eq('company_id', companyId)
              .in('status', statusVals)
              .order('order_date', { ascending: false })
              .range(from, from + PAGE - 1)
            if (error || !data || !data.length) break
            for (const o of data) { const e = String(o.customer_email || '').toLowerCase(); if (e) emails.add(e) }
            if (data.length < PAGE) break
          }
        }
        if (!cancelled) { orderStatusRef.current = { companyId, status, emails }; setOrderStatusEmails(emails) }
      } catch (e) { console.error('inbox order-status filter load failed', e) }
    })()
    return () => { cancelled = true }
  }, [filters.orderStatus, companyId])

  const orderStatusMatches = (email: string | undefined) =>
    !!email && orderStatusEmails.has(email.toLowerCase())
  // The contact card has its own assign dropdown and overflow menu, anchored to
  // their own buttons (previously the card's assign button faked a click on the
  // header menu, which opened a panel at the top of the page).
  const [showCardAssign, setShowCardAssign] = useState(false)
  const [cardAssignSearch, setCardAssignSearch] = useState('')
  const [showCardMore, setShowCardMore] = useState(false)
  // Internal staff-only note composer state.
  const [internalMode, setInternalMode] = useState(false)
  // Inline URL shortener in the composer
  const [showShortener, setShowShortener] = useState(false)
  const [shortenInput, setShortenInput] = useState('')
  const [shortenBusy, setShortenBusy] = useState(false)
  const [shortenError, setShortenError] = useState('')
  const [mentionedUsers, setMentionedUsers] = useState<any[]>([])
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [assignSearch, setAssignSearch] = useState('')
  // Conversation list pagination — start at 50 and grow via "Load more" so a
  // large inbox doesn't fetch everything up front.
  const [convLimit, setConvLimit] = useState(50)
  const convLimitRef = useRef(50)
  useEffect(() => { convLimitRef.current = convLimit }, [convLimit])
  const [searchExtraConvs, setSearchExtraConvs] = useState<any[]>([])
  const [hasMoreConvs, setHasMoreConvs] = useState(false)
  // True while a conversation page is being fetched — gates the filter auto-fill
  // (below) so it doesn't stack page requests while one is already in flight.
  const convLoadingRef = useRef(false)
  const [showContactEdit, setShowContactEdit] = useState(false)
  const [editContact, setEditContact] = useState<Partial<Contact>>({})
  // The linked WooCommerce order's billing, fetched explicitly for the "Fill from
  // order" backfill — the merged `wooOrders` list drops the billing object, so we
  // read it straight from woocommerce_orders here.
  const [orderBilling, setOrderBilling] = useState<any>(null)
  useEffect(() => {
    setOrderBilling(null)
    if (!showContactEdit || !companyId) return
    const email = String((editContact as any).email || '').trim()
    const phone = String((editContact as any).phone || '')
    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
    const hasBilling = (o: any) => o?.billing && (o.billing.first_name || o.billing.last_name || o.billing.phone || o.billing.address_1)
    ;(async () => {
      let order: any = null
      if (email) {
        const { data } = await (supabase as any).from('woocommerce_orders')
          .select('billing, order_date').eq('company_id', companyId).ilike('customer_email', email)
          .order('order_date', { ascending: false }).limit(10)
        order = (data || []).find(hasBilling)
      }
      if (!order && norm(phone).length >= 8) {
        const { data } = await (supabase as any).from('woocommerce_orders')
          .select('billing, order_date').eq('company_id', companyId).eq('billing_phone_norm', norm(phone))
          .order('order_date', { ascending: false }).limit(10)
        order = (data || []).find(hasBilling)
      }
      setOrderBilling(order?.billing || null)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showContactEdit, (editContact as any).email, (editContact as any).phone, companyId])
  const [aiDetected, setAiDetected] = useState<{ name?: string | null; phone?: string | null; email?: string | null; address?: string | null } | null>(null)
  const [aiSavedFields, setAiSavedFields] = useState<Set<string>>(new Set())
  const [savingContact, setSavingContact] = useState(false)
  const [activePanel, setActivePanel] = useState<'info' | 'timeline' | 'orders'>('info')
  const [wooCustomer, setWooCustomer] = useState<any>(null)
  const [wooOrders, setWooOrders] = useState<any[]>([])
  // True while the order history for the selected contact is being fetched, so
  // the panel shows "Loading…" instead of "No orders found" before the query
  // returns (that flash of the empty state read as "it's broken").
  const [wooOrdersLoading, setWooOrdersLoading] = useState(false)
  const [prextyCustomer, setPrextyCustomer] = useState<any>(null)
  // Look up the contact's Prexty POS profile (spend, loyalty, store credit) when
  // one is selected. Silent no-op if Prexty isn't connected or there's no match.
  useEffect(() => {
    setPrextyCustomer(null)
    if (!companyId || !contact || (!contact.email && !contact.phone)) return
    let cancelled = false
    ;(async () => {
      try {
        const p = new URLSearchParams({ companyId })
        if (contact.id) p.set('contactId', String(contact.id))
        if (contact.email) p.set('email', contact.email)
        if (contact.phone) p.set('phone', contact.phone)
        const res = await authFetch(`/api/prexty/customer?${p.toString()}`)
        const d = await res.json()
        if (!cancelled && d?.connected && d?.customer) setPrextyCustomer(d.customer)
      } catch { /* Prexty is best-effort; never blocks the panel */ }
    })()
    return () => { cancelled = true }
  }, [companyId, contact?.id, contact?.email, contact?.phone])
  // Switching chats quickly used to let a slow response from the PREVIOUS
  // contact land after the new one and overwrite the panel. Every load takes a
  // ticket; only the newest is allowed to write to state.
  const wooSeqRef = useRef(0)
  // Remembering what we already fetched makes going back to a chat instant
  // instead of re-running the whole sequence.
  const wooCacheRef = useRef<Map<string, { customer: any; orders: any[]; carts: any[] }>>(new Map())
  // Does woocommerce_orders have the normalised-email column (V265)? null = not
  // probed yet, true = use the index-backed eq lookup, false = migration not run
  // so fall back to the (slower) ilike scan. Memoised for the session so we only
  // pay the probe once.
  const wooEmailNormRef = useRef<boolean | null>(null)
  const [abandonedCarts, setAbandonedCarts] = useState<any[]>([])
  // A customer's off-inbox engagement (Google reviews + FB/IG comments), for the
  // info-panel stars, the header pills and the thread event cards.
  const emptyEngagement = { count: 0, avg: null as number | null, latest: null as any, reviews: [] as any[], socialComments: [] as any[], commentCount: 0, latestComment: null as any }
  const [contactReviews, setContactReviews] = useState<typeof emptyEngagement>(emptyEngagement)
  useEffect(() => {
    const cid = contact?.id
    if (!cid || !companyId) { setContactReviews(emptyEngagement); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/contacts/reviews?contactId=${encodeURIComponent(cid)}&companyId=${encodeURIComponent(companyId)}`, {
          headers: { Authorization: `Bearer ${session?.access_token || ''}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setContactReviews({
          count: data.count || 0, avg: data.avg ?? null, latest: data.latest || null, reviews: data.reviews || [],
          socialComments: data.socialComments || [], commentCount: data.commentCount || 0, latestComment: data.latestComment || null,
        })
      } catch { /* engagement is a nice-to-have; never block the panel */ }
    })()
    return () => { cancelled = true }
  }, [contact?.id, companyId])
  const [orderSearch, setOrderSearch] = useState('')
  const [orderDateFrom, setOrderDateFrom] = useState('')
  const [orderDateTo, setOrderDateTo] = useState('')
  const [showOrderSearch, setShowOrderSearch] = useState(false)
  const [loading, setLoading] = useState(!seededConvs)
  // New chat features
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showReactPicker, setShowReactPicker] = useState<string | null>(null)
  const [events, setEvents] = useState<any[]>([])
  // Calls belonging to the open conversation, pulled from the `calls` table.
  // Used to surface historical calls that predate the server-side call-card
  // linking rows (and any call the browser/webhook never posted a card for),
  // deduped in the render against calls that already have a timeline message.
  const [convCalls, setConvCalls] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  // Collapsible Notes/Tasks panels (Coax-style headers with a chevron).
  const [notesOpen, setNotesOpen] = useState(true)
  const [tasksOpen, setTasksOpen] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editTaskText, setEditTaskText] = useState('')
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const [newTask, setNewTask] = useState('')
  const [newTaskAssignee, setNewTaskAssignee] = useState('')
  const [refundOrder, setRefundOrder] = useState<any>(null)
  const [orderGallery, setOrderGallery] = useState<{ images: { src: string; name: string }[]; index: number } | null>(null)
  const [invoicePreview, setInvoicePreview] = useState<{ doc: any; url: string; fileName: string; orderNumber: string } | null>(null)
  const [invoiceSending, setInvoiceSending] = useState(false)
  const [pickupModal, setPickupModal] = useState<{ payload: any; locationId: string } | null>(null)
  const [pickupSending, setPickupSending] = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [aiTodos, setAiTodos] = useState<any[]>([])
  const [generatingAi, setGeneratingAi] = useState(false)
  const [showSnooze, setShowSnooze] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  // Bumped to force the realtime subscription to rebuild after a dropped socket.
  const [realtimeNonce, setRealtimeNonce] = useState(0)

  // ── Forward media to another contact ─────────────────────────────────────
  // The message's photos/videos being forwarded, and which of them are ticked.
  // Forward on a photo in a multi-photo message offers the whole set, so all of
  // them can go in one send (it used to forward only the tile clicked).
  const [forwarding, setForwarding] = useState<any[] | null>(null)
  const [forwardPicked, setForwardPicked] = useState<boolean[]>([])
  const openForward = (items: any[]) => {
    setForwarding(items); setForwardPicked(items.map(() => true))
    setForwardSearch(''); setForwardResults([])
  }
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardResults, setForwardResults] = useState<any[]>([])
  const [forwardBusy, setForwardBusy] = useState(false)

  const searchForwardTargets = async (q: string) => {
    setForwardSearch(q)
    if (!companyId || q.trim().length < 2) { setForwardResults([]); return }
    const { data } = await (supabase as any).from('contacts')
      .select('id, name, email, phone').eq('company_id', companyId)
      .or(`name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`)
      .limit(10)
    setForwardResults(data || [])
  }

  const forwardTo = async (contactTarget: any) => {
    if (!companyId || !forwarding || !user) return
    // Only the file itself goes on: the original's expiry and viewer link
    // belonged to that conversation.
    const picked = forwarding.filter((_, i) => forwardPicked[i])
      .map((a: any) => ({ url: a.url, name: a.name, type: a.type, kind: a.kind, ...(a.size ? { size: a.size } : {}) }))
    if (!picked.length) return
    const who = contactTarget.name || contactTarget.email || contactTarget.phone
    // Close straight away and carry on in the background: the agent shouldn't
    // sit watching a dialog while the photos go out.
    setForwardBusy(true)
    setForwarding(null); setForwardSearch(''); setForwardResults([])
    showToast(`Forwarding ${picked.length > 1 ? `${picked.length} items` : 'it'} to ${who}…`)
    try {
      // Find-or-create a conversation with that person, so the media lands in a
      // real thread rather than nowhere.
      let convId: string | null = null
      const { data: existing } = await (supabase as any).from('conversations')
        .select('id').eq('company_id', companyId).eq('contact_id', contactTarget.id)
        .order('last_message_at', { ascending: false }).limit(1)
      convId = existing?.[0]?.id || null

      if (!convId) {
        const { data: created } = await (supabase as any).from('conversations').insert({
          company_id: companyId, channel: 'chat', contact_id: contactTarget.id,
          subject: contactTarget.name || contactTarget.email,
          status: 'open', is_unread: false,
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        convId = created?.id || null
      }
      if (!convId) throw new Error('Could not open a conversation with that contact')

      const me = myName
      const media = picked.filter(a => a.kind === 'image' || a.kind === 'video')
      const plainFiles = picked.filter(a => a.kind !== 'image' && a.kind !== 'video')

      // One branded gallery link for all the photos and videos, the same as
      // sending them from the composer. Passing the files to the SMS route
      // instead made a link per file, one after another, and texted them all.
      let galleryUrl = ''
      if (media.length) {
        try {
          const res = await authFetch('/api/short-links/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, kind: 'media', url: media[0].url, mediaUrls: media,
              label: media.length > 1 ? `${media.length} photos` : (media[0].kind === 'video' ? 'Video' : 'Photo'),
              conversationId: convId, sentBy: me,
            }),
          })
          const d = await readJsonSafe(res)
          if (res.ok && d.url) galleryUrl = d.url
        } catch { /* fall back to the files' own links below */ }
      }

      // Text it too, if that's how we talk to them. A failed text must not lose
      // the forward — the message still goes in the thread below — but it must
      // not pass silently either. Swallowing it here is why forwarding to a
      // landline looked like it worked on the web and broken on mobile.
      const phone = contactTarget.phone
      let smsError = ''
      if (phone) {
        const parts: string[] = []
        if (galleryUrl) parts.push(galleryUrl)
        else for (const m of media) parts.push(m.url)
        for (const f of plainFiles) parts.push(`📎 ${f.name}: ${f.url}`)
        try {
          const res = await authFetch('/api/telnyx/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: convId, to: phone,
              text: parts.join('\n'), attachments: [], senderName: me, skipChatMessage: true,
            }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => null)
            smsError = d?.error || `HTTP ${res.status}`
          }
        } catch (e: any) {
          smsError = e?.message || 'Could not reach the SMS service'
        }
      }

      const now = new Date().toISOString()
      await Promise.all([
        (supabase as any).from('messages').insert({
          conversation_id: convId, company_id: companyId,
          sender_type: 'agent', sender_id: user.id, sender_name: me, sender_email: user.email,
          content: '', attachments: galleryUrl ? picked.map(a => ({ ...a, viewer_url: galleryUrl })) : picked,
          delivery_channel: phone ? 'sms' : 'chat',
          metadata: { forwarded: true, ...(galleryUrl ? { gallery_url: galleryUrl } : {}) },
        }),
        (supabase as any).from('conversations').update({
          last_message: media.length ? (media.length > 1 ? `🖼️ ${media.length} photos` : '🖼️ Photo') : (picked.length === 1 ? '📎 Attachment' : `📎 ${picked.length} attachments`),
          last_message_at: now, updated_at: now,
        }).eq('id', convId),
      ])

      showToast(smsError
        ? `Forwarded to ${who}, but the text did not go out: ${smsError}`
        : `Forwarded to ${who}`)
      loadConversations()
    } catch (e: any) {
      showToast('Could not forward: ' + e.message)
    } finally {
      setForwardBusy(false)
    }
  }
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const EMOJIS = ['👍', '❤️', '😊', '🎉', '🙏', '😂', '🔥', '👀', '✅', '😢', '😮', '💯']

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          // Not authenticated on this subdomain — send them to sign in instead of
          // hanging on "Loading inbox…" forever (the old early-return left the
          // full-page spinner up with no way out).
          if (typeof window !== 'undefined') window.location.href = '/signin'
          return
        }
        setUser(session.user)
        let cid: string | null = seededCid
        if (!cid) {
          // The shared, once-per-session company lookup (subdomain slug, then
          // owned company) — also what seeds the NEXT visit to the inbox with
          // its cached list instead of the full-page "Loading inbox…".
          try { cid = (await resolveCompanyUser()).companyId } catch {}
        }
        if (!cid) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
        if (!cid) return
        setCompanyId(cid)
        // Show the inbox ASAP: the conversation load is driven by the
        // loadConversations effect (it already ran on mount for a seeded
        // company, or runs as soon as companyId is set above) — calling it here
        // too fired a second, identical list + contacts + backfill load on every
        // open. The company chrome (logo/name/accent/time-format) and the team
        // list stay OFF the critical path — they only enrich the UI.
        loadTeam(cid)
        ;(supabase as any)
          .from('companies')
          .select('name, logo_url, accent_color, slug, conversation_actions, inbox_settings, payment_settings')
          .eq('id', cid).maybeSingle()
          .then(({ data: ci }: any) => {
            if (!ci) return
            setCompanyInfo(ci); setConvActions(ci.conversation_actions || {})
            const h12 = ci.inbox_settings?.hour12
            if (typeof h12 === 'boolean') { setInboxHour12(h12); setHour12(h12) }
          })
      } finally {
        // ALWAYS clear the full-page spinner — a slow query or an early return must
        // never leave the inbox stuck on "Loading inbox…".
        setLoading(false)
      }
    }
    init()
  }, [])

  const loadConversations = useCallback(async (cid?: string | null) => {
    const id = cid || companyId
    if (!id) return
    convLoadingRef.current = true
    try {
    // NOTE: conversations.contact_id has no FK to contacts in some deployments,
    // so a PostgREST embed (`contacts(...)`) fails the WHOLE query and returns
    // nothing (blank inbox). Fetch conversations plainly, then attach contacts.
    // Instant paint on revisit / filter switch: show the last list we rendered
    // for this filter while the fresh rows load in the background.
    const cacheKey = `inbox-convs:${id}:${statusFilter}`
    const cachedConvs = readCache<Conversation[]>(cacheKey)
    if (cachedConvs && cachedConvs.length) setConversations(cachedConvs)

    let q = (supabase as any).from('conversations').select('*').eq('company_id', id)
    // "Closed" covers closed + resolved; "Open" is everything else.
    if (statusFilter === 'closed') q = q.in('status', ['closed', 'resolved'])
    else q = q.not('status', 'in', '("closed","resolved")')
    const { data } = await q.order('last_message_at', { ascending: false }).limit(convLimitRef.current)
    const convs = data || []
    // If we got a full page back there are probably more to load.
    setHasMoreConvs(convs.length >= convLimitRef.current)

    // On first load (desktop), OPEN the top conversation — including its messages
    // and contact — instead of just highlighting it (which left the pane blank).
    // BUT not when we arrived via ?conversation=<id>: the deep-link handler will
    // open that specific thread (even if it's in another folder), so don't flash
    // the wrong (top) conversation first. Started right away (it reads its own
    // messages + contact) so the thread loads in parallel with the list's
    // contact enrichment below rather than after it.
    const hasDeepLink = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('conversation') || new URLSearchParams(window.location.search).get('colvy'))
    // Not while the Colvy chat is open either: nothing is selected then, and the
    // refresh used to swap it for the newest conversation every few seconds.
    if (data && data.length > 0 && !selectedRef.current && !colvyOpenRef.current && !hasDeepLink && typeof window !== 'undefined' && window.innerWidth >= 768) {
      selectConversation(data[0])
    }

    // Attach contact details in one extra query, and — in parallel, since the
    // two are independent — resolve unlinked phone threads (below). These used
    // to run one after the other, then persist each link one at a time, all
    // before the list could paint.
    const contactIds = Array.from(new Set(convs.map((c: any) => c.contact_id).filter(Boolean)))

    // Fallback: a conversation with no contact_id but a phone (sms_number) may
    // match a contact that was added AFTER the thread started — the manual link
    // never happened. Resolve by the last 9 digits, attach the name, and persist
    // contact_id so the list, thread and Details panel all show it from now on.
    const dig = (p: string) => (p || '').replace(/\D/g, '')
    const unlinked = convs.filter((c: any) => !c.contact_id && dig(c.sms_number || c.phone).length >= 8)
    const tails = Array.from(new Set(unlinked.map((c: any) => dig(c.sms_number || c.phone).slice(-9))))

    // Reloads (every realtime burst, the poll, filter switches) mostly return
    // conversations whose contacts are already on screen. When all of them are
    // known, paint the fresh rows now with those contacts; the enriched rows
    // below then replace them (identical unless a contact changed meanwhile).
    const known = new Map<string, any>()
    const prevById = new Map<string, any>()
    for (const c of conversationsRef.current as any[]) {
      prevById.set(c.id, c)
      if (c.contact_id && c.contacts) known.set(c.contact_id, c.contacts)
    }
    if (convs.length && contactIds.every((cid: any) => known.has(cid))) {
      setConversations(convs.map((c: any) => {
        if (c.contact_id) return { ...c, contacts: known.get(c.contact_id) }
        // A phone thread linked by an earlier backfill whose write hasn't
        // landed yet keeps the contact it was showing.
        const p = prevById.get(c.id)
        return p?.contacts ? { ...c, contact_id: p.contact_id, contacts: p.contacts } : { ...c }
      }))
    }

    const [ctsById, candRes] = await Promise.all([
      contactIds.length ? contactsByIds(contactIds as string[]) : Promise.resolve({} as Record<string, any>),
      unlinked.length
        ? (supabase as any).from('contacts').select('id, name, email, phone, relationship_type').eq('company_id', id)
            .or(tails.map((t: string) => `phone.ilike.%${t}%`).join(',')).limit(200)
        : Promise.resolve(null),
    ])

    if (contactIds.length) {
      // Keep what a row was showing if its contact couldn't be read this time.
      for (const c of convs) (c as any).contacts = c.contact_id ? ctsById[c.contact_id] || known.get(c.contact_id) || null : null
    }

    const cand = candRes?.data
    if (unlinked.length && cand && cand.length) {
      const linked: { conv: string; contact: string }[] = []
      for (const c of unlinked) {
        const tail = dig(c.sms_number || c.phone).slice(-9)
        const m = cand.find((ct: any) => ct.phone && dig(ct.phone).endsWith(tail))
        if (m) { (c as any).contacts = m; (c as any).contact_id = m.id; linked.push({ conv: c.id, contact: m.id }) }
      }
      // Persist the links in the background — the list doesn't need to wait.
      if (linked.length) runPool(linked, 4, l => (supabase as any).from('conversations').update({ contact_id: l.contact }).eq('id', l.conv))
    }

    setConversations(convs)
    writeCache(cacheKey, convs)
    } finally { convLoadingRef.current = false }
  }, [companyId, statusFilter, convLimit])

  useEffect(() => { loadConversations() }, [statusFilter, loadConversations])

  // The realtime subscription is created once per (company, nonce) and captures
  // loadConversations at that moment — which froze the status filter to whatever
  // it was then ('open'). So any conversation update while on the Closed tab
  // reloaded the list with the OPEN filter: the rows became open conversations
  // while the tab still said Closed, and you lost your place. Routing realtime
  // reloads through a ref that always points at the current loadConversations
  // keeps the filter correct without re-subscribing on every filter change.
  const loadConversationsRef = useRef(loadConversations)
  useEffect(() => { loadConversationsRef.current = loadConversations }, [loadConversations])
  useEffect(() => { loadWooDataRef.current = loadWooData })

  // Coalesce full conversation-list reloads. Every realtime message/conversation
  // event used to call loadConversations() straight away — TWICE per inbound
  // message (unread-clear + float-to-top) plus once per conversation update, and
  // the 5s poll fired another on top. That's a full list query + contacts query
  // + phone-backfill running many times a second on a busy inbox, which is what
  // made the whole page feel slow. The realtime handlers already patch the list
  // in place (append the message, float the thread to the top, zero the badge),
  // so the reconciling full reload only needs to run once per burst. This batches
  // any number of events within the window into a single trailing reload.
  const convReloadTimer = useRef<any>(null)
  const scheduleConvReload = useRef((delay = 700) => {
    if (convReloadTimer.current) return
    convReloadTimer.current = setTimeout(() => {
      convReloadTimer.current = null
      loadConversationsRef.current()
    }, delay)
  }).current

  // Deep-link: open a conversation from ?conversation=<id> (copy chat link, or
  // "Open conversation" from the Orders board). The target may be closed/resolved
  // or otherwise outside the current folder, so it won't be in the loaded list —
  // fetch it directly and open it rather than silently doing nothing (which left
  // the top thread showing, i.e. the wrong conversation).
  const deepLinkedRef = useRef<string | null>(null)
  // The channel a deep link asked for (?channel=sms|email|chat), applied once
  // its conversation is open (see the reset effect by sendChannel).
  const pendingSendChannelRef = useRef<string | null>(null)
  useEffect(() => {
    if (selected) return
    if (typeof window === 'undefined' || !companyId) return
    const convId = new URLSearchParams(window.location.search).get('conversation')
    if (!convId || deepLinkedRef.current === convId) return
    const wantCh = new URLSearchParams(window.location.search).get('channel')
    pendingSendChannelRef.current = (wantCh === 'sms' || wantCh === 'email' || wantCh === 'chat') ? wantCh : null
    const found = conversations.find(c => c.id === convId)
    if (found) { deepLinkedRef.current = convId; selectConversation(found); return }
    // Not in the current folder — load it on its own and open it.
    ;(async () => {
      deepLinkedRef.current = convId
      const { data: conv } = await (supabase as any).from('conversations').select('*').eq('id', convId).maybeSingle()
      if (!conv) { deepLinkedRef.current = null; return }
      // Only this workspace's conversations open here. Someone in several
      // workspaces can read the others too, and a link (or a notification)
      // from one used to open that conversation inside this one, replying
      // from that workspace's inbox. Send them to its own workspace instead.
      if (conv.company_id !== companyId) {
        const { data: home } = await (supabase as any).from('companies').select('slug').eq('id', conv.company_id).maybeSingle()
        const host = window.location.hostname
        if (home?.slug && host.endsWith('colvy.com')) { window.location.href = boardUrl(home.slug, `/admin/inbox?conversation=${encodeURIComponent(convId)}`); return }
        showToast('That conversation is in another workspace.')
        try { window.history.replaceState(null, '', '/admin/inbox') } catch {}
        return
      }
      if (conv.contact_id) {
        const { data: ct } = await (supabase as any).from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
        if (ct) (conv as any).contacts = ct
      }
      setConversations(prev => prev.some(c => c.id === conv.id) ? prev : [conv, ...prev])
      selectConversation(conv)
    })()
  }, [conversations, selected, companyId])

  // Deep-link: open (or start) a thread with a specific contact from
  // ?contact=<id>&channel=<sms|email|chat>. This is what the "Message" / "Email"
  // buttons on the Contacts list and customer profile use so those actions stay
  // inside Colvy instead of firing an `sms:` / `mailto:` link that hands off to
  // the device's own apps. Find the contact's most recent conversation, or create
  // an empty one, then open it with the compose channel pre-selected.
  const deepContactRef = useRef<string | null>(null)
  // Find-or-create this contact's conversation and open it. Shared by the
  // on-mount ?contact= deep link AND the live "open this contact" event below.
  const openContactDeepLink = useCallback(async (contactId: string, wantCh: string | null) => {
    if (!companyId || !user || !contactId) return
    try {
      // This workspace's contact only (never another workspace's, which would
      // start a conversation here with someone else's customer).
      const { data: ct } = await (supabase as any).from('contacts')
        .select('*').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (!ct) { deepContactRef.current = null; return }
      // Find-or-create a conversation for this contact.
      const { data: existing } = await (supabase as any).from('conversations')
        .select('*').eq('company_id', companyId).eq('contact_id', contactId)
        .order('last_message_at', { ascending: false }).limit(1)
      let conv: any = existing?.[0] || null
      if (!conv) {
        const chan = wantCh === 'email' ? 'email' : wantCh === 'sms' ? 'sms' : 'chat'
        const { data: created } = await (supabase as any).from('conversations').insert({
          company_id: companyId, channel: chan, contact_id: contactId,
          subject: ct.name || ct.email || ct.phone || 'New conversation',
          status: 'open', is_unread: false,
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('*').maybeSingle()
        conv = created || null
      }
      if (!conv) { deepContactRef.current = null; return }
      conv.contacts = ct
      setConversations(prev => prev.some(c => c.id === conv.id) ? prev : [conv, ...prev])
      // Applied by the per-conversation reset once this one opens; when it's
      // already open that effect won't run, so it's set directly and cleared.
      const already = selectedRef.current?.id === conv.id
      pendingSendChannelRef.current = !already && (wantCh === 'sms' || wantCh === 'email' || wantCh === 'chat') ? wantCh : null
      selectConversation(conv)
      if (wantCh === 'sms' || wantCh === 'email' || wantCh === 'chat') setSendChannel(wantCh)
      // Strip the params so a refresh doesn't re-open / re-create anything.
      try { window.history.replaceState(null, '', '/admin/inbox') } catch {}
    } catch { deepContactRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, user])

  // ?contact=<id>&channel=<sms|email|chat>. This is what the "Message" / "Email"
  // buttons on the Contacts list and customer profile use so those actions stay
  // inside Colvy instead of firing an `sms:` / `mailto:` link that hands off to
  // the device's own apps.
  useEffect(() => {
    if (!companyId || !user || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const contactId = params.get('contact')
    if (!contactId || deepContactRef.current === contactId) return
    deepContactRef.current = contactId
    openContactDeepLink(contactId, params.get('channel'))
  }, [companyId, user, openContactDeepLink])

  // Live "open in inbox" — the in-call panel and other persistent UI fire this
  // when the inbox is ALREADY mounted. A same-route router.push('/admin/inbox?
  // contact=…') never re-runs the mount effect above, so that button did nothing
  // when you were already on the inbox. Prefer an already-loaded conversation;
  // otherwise fall back to the contact find-or-create path.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (e: any) => {
      const conversationId = e?.detail?.conversationId
      const contactId = e?.detail?.contactId
      if (conversationId) {
        const existing = conversations.find(c => c.id === conversationId)
        if (existing) { selectConversation(existing); return }
      }
      if (contactId) { deepContactRef.current = contactId; openContactDeepLink(contactId, null) }
    }
    window.addEventListener('colvy:open-contact', handler as EventListener)
    return () => window.removeEventListener('colvy:open-contact', handler as EventListener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openContactDeepLink, conversations])

  // Close the assign dropdown / actions menu when clicking elsewhere
  useEffect(() => {
    if (!showAssignMenu && !showActions && !showCardAssign && !showCardMore && !showStatusMenu) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-status-menu]')) setShowStatusMenu(false)
      if (!target.closest('[data-assign-menu]')) setShowAssignMenu(false)
      if (!target.closest('[data-actions-menu]')) setShowActions(false)
      if (!target.closest('[data-card-assign]')) setShowCardAssign(false)
      if (!target.closest('[data-card-more]')) setShowCardMore(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssignMenu, showActions, showCardAssign, showCardMore, showStatusMenu])

  // Close the media-expiry selector when clicking elsewhere.
  useEffect(() => {
    if (!expiryMenuFor) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-expiry-picker]')) { setExpiryMenuFor(null); setCustomDateFor(null) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expiryMenuFor])

  // Close the bulk-expiry selector when clicking elsewhere.
  useEffect(() => {
    if (!bulkExpiryOpen) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-bulk-expiry]')) { setBulkExpiryOpen(false); setBulkCustomDate(false) }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [bulkExpiryOpen])

  // Realtime subscription to new messages / conversation updates
  useEffect(() => {
    if (!companyId) return
    // CRITICAL: supabase.channel(name) returns the EXISTING instance if a
    // channel with that topic is still registered on the global client — and
    // adding postgres_changes callbacks to an already-subscribed channel throws
    // "cannot add postgres_changes callbacks ... after subscribe()". A previous
    // mount's channel survives navigation (channelRef is a fresh ref on
    // remount), so sweep the client for ANY channel with this topic and remove
    // it before building a new one.
    try {
      const prefix = `realtime:inbox-${companyId}`
      for (const existing of (supabase as any).getChannels?.() || []) {
        if (typeof existing?.topic === 'string' && existing.topic.startsWith(prefix)) {
          try { supabase.removeChannel(existing) } catch {}
        }
      }
    } catch {}
    if (channelRef.current) { try { supabase.removeChannel(channelRef.current) } catch {}; channelRef.current = null }
    // Message UPDATEs waiting to be applied in one batch (see below).
    const pendingMsgUpdates = new Map<string, any>()
    let msgUpdateTimer: any = null
    // Belt AND braces: a UNIQUE topic per subscription. Even if a previous
    // channel somehow survives (a cleanup that didn't run, a React 18 double
    // mount, a fast back/forward), this new name can never collide with it, so
    // .on() is always called on a fresh, unsubscribed channel.
    const ch = supabase.channel(`inbox-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        scheduleConvReload()
        // Keep the OPEN conversation fresh too — page history, status and
        // assignment are stored on the conversation row, and without this they
        // only appeared after a manual page reload.
        const row = payload.new
        if (row?.id && selectedRef.current?.id === row.id) {
          setSelected((prev: any) => (prev ? { ...prev, ...row } : prev))
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        // selectedRef, not `selected` — the closure captured at subscribe time
        // would otherwise be stale and drop messages.
        const isOpen = selectedRef.current?.id === payload.new.conversation_id
        if (isOpen) {
          setMessages(prev => {
            if (prev.some((m: any) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          scrollBottom()
          // The agent is looking at this thread, so anything landing in it is
          // already "read". Clear its unread counter — this is what stopped the
          // badge from climbing on the very conversation you're replying to (an
          // inbound reply mid-chat, or your own outbound echoing back, used to
          // bump/keep the count even though you'd obviously seen it).
          ;(supabase as any).from('conversations')
            .update({ is_unread: false, unread_count: 0 })
            .eq('id', payload.new.conversation_id)
            .then(() => scheduleConvReload(), () => {})
          // An order automation message means a new order just landed for this
          // customer. Refresh the order panel so the Orders tab populates
          // without a manual page reload.
          const md = payload.new.metadata
          if (md && (md.order_automation || md.order_id)) {
            const cref = selectedRef.current as any
            setTimeout(() => loadWooDataRef.current?.(cref?.contact_id || null), 800)
          }
        }
        // Float the conversation that just got a message to the top of the list
        // immediately, so an active thread that had drifted to the bottom (buried
        // by newer conversations) comes back up without waiting for a reload or a
        // manual scroll. If it's the open thread, also zero its badge locally so
        // it never flashes an unread count while you're in it.
        setConversations(prev => prev.map((c: any) =>
          c.id === payload.new.conversation_id
            ? { ...c, last_message_at: payload.new.created_at || new Date().toISOString(), ...(isOpen ? { is_unread: false, unread_count: 0 } : {}) }
            : c
        ))
        scheduleConvReload()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        // Reactions, read receipts and payment status are UPDATEs to the message
        // row. We only listened for INSERTs, so a reaction never showed until
        // the page was reloaded.
        if (selectedRef.current?.id === payload.new.conversation_id) {
          // Coalesce bursts (opening a thread stamps a read receipt on every
          // message, and each comes back as an UPDATE) into one re-render of
          // the thread per frame instead of one per row.
          const prevUpd = pendingMsgUpdates.get(payload.new.id)
          pendingMsgUpdates.set(payload.new.id, prevUpd ? { ...prevUpd, ...payload.new } : payload.new)
          if (!msgUpdateTimer) {
            msgUpdateTimer = setTimeout(() => {
              msgUpdateTimer = null
              const upd = new Map(pendingMsgUpdates); pendingMsgUpdates.clear()
              const openId = selectedRef.current?.id
              setMessages(prev => prev.map((m: any) => {
                const u = upd.get(m.id)
                return u && u.conversation_id === openId ? { ...m, ...u } : m
              }))
            }, 32)
          }
        }
      })
      .subscribe()
    channelRef.current = ch

    // A tab left open for hours loses its realtime socket (laptop sleeps, network
    // drops, the browser throttles background tabs). Everything then looks
    // "stale" until a manual reload — reactions don't appear, page history
    // doesn't update. Re-subscribe and refresh whenever the tab wakes up.
    const revive = () => {
      if (document.visibilityState !== 'visible') return
      try {
        const state = (channelRef.current as any)?.state
        if (state !== 'joined') {
          if (channelRef.current) supabase.removeChannel(channelRef.current)
          channelRef.current = null
          setRealtimeNonce(n => n + 1)   // rebuild the subscription
        }
      } catch {}
      // Pull fresh data either way — cheap, and it guarantees we're current.
      loadConversationsRef.current()
      if (selectedRef.current?.id) {
        const openId = selectedRef.current.id
        fetchThread(openId)
          .then(({ data, since, fresh }) => { if (data && selectedRef.current?.id === openId) applyThread(openId, data, since, fresh) })
          .catch(() => {})
        ;(supabase as any).from('conversations').select('*')
          .eq('id', selectedRef.current.id).maybeSingle()
          .then(({ data }: any) => { if (data) setSelected((p: any) => (p ? { ...p, ...data } : p)) })
      }
    }
    document.addEventListener('visibilitychange', revive)
    window.addEventListener('focus', revive)
    window.addEventListener('online', revive)

    // Polling fallback — a safety net for when realtime isn't enabled on the
    // messages table. Realtime, when it works, already keeps the list and the
    // open thread live, so this only needs to run occasionally: at 5s it was
    // reloading the whole conversation list every 5s on top of the realtime
    // reloads, which was a big part of why the inbox felt slow. Now every 15s,
    // and the list reload goes through the coalescing scheduler so it can never
    // stack up. Uses selectedRef so it always polls the currently open thread.
    const poll = setInterval(async () => {
      // scheduleConvReload keeps the current status filter correct (it calls the
      // ref, not the closure frozen to the filter at subscribe time).
      scheduleConvReload(0)
      const openId = selectedRef.current?.id
      if (openId) {
        // Only the loaded window is re-read — not the whole history every 15s.
        const { data: msgs, since, fresh } = await fetchThread(openId)
        if (msgs && selectedRef.current?.id === openId) {
          if (fresh) applyThread(openId, msgs, since, true)
          // Skip if older pages were loaded while this read was in flight.
          else if (threadWinRef.current.convId === openId && threadWinRef.current.since === since) {
            setMessages(prev => msgs.length !== prev.length ? msgs : prev)
          }
        }
      }
    }, 15000)

    // ONE cleanup path. The old code had two return statements — the first
    // (listener removal) won, so removeChannel(ch) was dead code and the
    // channel outlived the page, crashing the next visit to the inbox.
    return () => {
      document.removeEventListener('visibilitychange', revive)
      window.removeEventListener('focus', revive)
      window.removeEventListener('online', revive)
      clearInterval(poll)
      if (msgUpdateTimer) { clearTimeout(msgUpdateTimer); msgUpdateTimer = null }
      if (convReloadTimer.current) { clearTimeout(convReloadTimer.current); convReloadTimer.current = null }
      try { supabase.removeChannel(ch) } catch {}
      if (channelRef.current === ch) channelRef.current = null
    }
  }, [companyId, realtimeNonce])

  const loadTeam = async (cid: string) => {
    const members: TeamMember[] = []
    // Company owner and staff side by side. Board visitors can't be assigned or
    // mentioned, and on a busy board they'd crowd staff out of one read.
    const [{ data: co }, data] = await Promise.all([
      (supabase as any).from('companies').select('owner_id, name').eq('id', cid).maybeSingle(),
      import('@/lib/team-list').then(({ loadStaffRows }) => loadStaffRows(supabase, cid)).catch(() => []),
    ])
    if (co?.owner_id) {
      members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner', role: 'owner' })
    }
    for (const m of data || []) {
      if (cid && m.company_id && m.company_id !== cid) continue
      const uid = m.user_id || m.id
      if (members.some(x => x.user_id === uid)) continue
      members.push({
        id: m.id,
        user_id: uid,
        name: m.name || m.display_name || m.email?.split('@')[0] || 'Team member',
        role: m.role || 'member',
        email: m.email,
      } as any)
    }
    // Pickers work straight away; real profile names fill in a moment later.
    setTeamMembers([...members])
    await enrichNames(members as any)
    setTeamMembers([...members])
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

  // After sending something into the open thread (coupon, upload link, payment
  // request…), pull in the new messages WITHOUT re-opening the conversation.
  // selectConversation clears the thread and contact first, so the header
  // flashed "Visitor", the history blanked and the scroll jumped — it looked
  // like the page had reloaded.
  const refreshThread = async () => {
    const convId = selectedRef.current?.id
    if (!convId) return
    const { data, since, fresh } = await fetchThread(convId)
    if (data && selectedRef.current?.id === convId) { applyThread(convId, data, since, fresh); scrollBottom() }
  }

  // Open the Colvy chat: nothing else is selected while it's open.
  const openColvy = () => {
    setSelected(null); selectedRef.current = null
    setColvyOpen(true); setMobilePane('thread')
  }
  // ?colvy=1 (a link to it) opens it once it's known to be there; so does the
  // account menu's "Message Colvy" while the inbox is already open.
  const colvyLinked = useRef(false)
  const colvyAvailable = useRef(false)
  colvyAvailable.current = colvy.available
  useEffect(() => {
    if (colvyLinked.current || !colvy.available || typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('colvy')) { colvyLinked.current = true; openColvy() }
  }, [colvy.available]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const open = () => { if (colvyAvailable.current) openColvy() }
    window.addEventListener('colvy:open', open)
    return () => window.removeEventListener('colvy:open', open)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectConversation = async (conv: Conversation) => {
    setColvyOpen(false)
    // Start every independent read for this conversation NOW, in parallel. The
    // thread used to wait on: full message history → unread update → contact →
    // timeline/calls, one round trip after another, before it finished loading.
    const msgsP = fetchLatestPage(conv.id)
    const contactP: Promise<any> | null = conv.contact_id
      ? (supabase as any).from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      : null
    // Reconcile any pending Stripe payments straight from Stripe. The webhook
    // may not be configured (or a delivery was missed), which would otherwise
    // leave a paid order showing as "pending" in the chat forever.
    try {
      authFetch('/api/stripe/verify-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conv.id }),
      }).then(r => r.json()).then(d => {
        // If something flipped to paid, refresh the thread so it shows.
        if (d?.updated > 0) {
          fetchThread(conv.id).then(({ data, since, fresh }) => {
            if (data && selectedRef.current?.id === conv.id) applyThread(conv.id, data, since, fresh)
          }).catch(() => {})
        }
      }).catch(() => {})
    } catch {}

    // The previous chat's timeline events are merged into the thread — don't
    // let them sit inside this one (now painted from cache straight away)
    // while its own events load.
    if (selectedRef.current?.id !== conv.id) setEvents([])
    setSelected(conv)
    selectedRef.current = conv
    setMobilePane('thread')
    setAiDetected(null)
    // Clear the PREVIOUS conversation's messages/contact immediately, before the
    // async fetch below resolves. Without this, the old thread's full history
    // stayed on screen — under the newly-clicked contact's name — until the
    // real (often much shorter) data for the new conversation loaded a moment
    // later, which looked like the page "shows the info and then hides it".
    // If we've shown THIS conversation before, paint its last-seen messages
    // straight away instead (stale-while-revalidate); the fresh page replaces it.
    const cachedThread = threadCacheGet(conv.id)
    lastThreadScrollTop.current = 0
    prependAnchorRef.current = null
    if (cachedThread) {
      setThreadWin({ convId: conv.id, since: cachedThread.since })
      setMessages(cachedThread.msgs as any)
      scrollBottom()
    } else {
      setThreadWin({ convId: null, since: null })
      setMessages([])
    }
    setContact(null)
    // Timeline events (merged into the thread) and calls don't depend on the
    // messages or contact — load them alongside instead of after.
    loadConversationExtras(conv.id)
    setConvCalls([])
    // Load this conversation's calls so any that lack a timeline card (historical
    // calls, or calls the browser/webhook never posted) still show in the thread.
    ;(supabase as any).from('calls')
      .select('id, created_at, direction, duration_seconds, recording_url, ai_summary, status, is_voicemail, agent_name')
      .eq('conversation_id', conv.id).order('created_at', { ascending: true }).limit(200)
      .then(({ data }: any) => { if (selectedRef.current?.id === conv.id) setConvCalls(data || []) }, () => {})
    // Restore which fields AI auto-saved for this contact (for the badge).
    try {
      const store = JSON.parse(localStorage.getItem('colvy-ai-saved') || '{}')
      setAiSavedFields(new Set(store[conv.contact_id] || []))
    } catch { setAiSavedFields(new Set()) }
    setShowContactEdit(false)
    setReplyTo(null)
    // Drop any staged-but-unsent media so it can't leak into another thread, and
    // abandon an in-progress voice recording.
    setStagedMedia([]); setStagedExpiry({}); setExpiryDeleteMode(false); setExpiryMenuFor(null); setCustomDateFor(null)
    if (recording) { recCancelRef.current = true; if (recTimerRef.current) clearInterval(recTimerRef.current); try { mediaRecRef.current?.stop() } catch {}; setRecording(false) }
    setAiSummary((conv as any).ai_summary || '')
    setAiTodos((conv as any).ai_todos || [])
    setChatDraftAnchor(draftAnchorFor(conv.id, (conv as any).ai_todos || []))
    // Load messages (the newest page — older pages load on scroll-up)
    let msgs: any[] = []
    try {
      const page = await msgsP
      msgs = page.rows
      // Clicked through several chats quickly: only the last one's messages show.
      if (selectedRef.current?.id !== conv.id) return
      setThreadWin({ convId: conv.id, since: page.since })
    } catch {
      if (selectedRef.current?.id !== conv.id) return
      setThreadWin({ convId: conv.id, since: null })
    }
    setMessages(msgs)
    scrollBottom()
    // Mark read + stamp read receipt on visitor messages. Neither needs to hold
    // up the contact panel below.
    ;(supabase as any).from('conversations').update({ is_unread: false, unread_count: 0 }).eq('id', conv.id)
      .then(() => {}, () => {})
    markMessagesRead(conv.id, msgs)
    // Load contact
    setShowDoa(false); setDoaMatch(false)
    // Captured so we can hand the resolved email/phone straight to loadWooData
    // below — it otherwise refetches the contact we already have here, adding a
    // needless round trip to the Order History panel's critical path.
    let resolvedEmail: string | null = null
    let resolvedPhone: string | null = null
    if (conv.contact_id && contactP) {
      let c: any = null
      try { c = (await contactP)?.data || null } catch {}
      if (selectedRef.current?.id !== conv.id) return
      resolvedEmail = c?.email || null
      resolvedPhone = c?.phone || null
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
      // Fire-and-forget: this must NOT sit on the critical path before
      // loadWooData below, or the Order History panel waits on this whole
      // network round trip before it even starts loading.
      if (c && (c.email || c.phone) && companyId) {
        ;(async () => {
          try {
            const params = new URLSearchParams({ companyId })
            if (c.email) params.set('email', c.email)
            if (c.phone) params.set('phone', c.phone)
            const res = await authFetch(`/api/doa/match?${params.toString()}`)
            const data = await res.json()
            if (data.match) setDoaMatch(true)
          } catch {}
        })()
      }
    } else {
      // No linked contact — try to match one added after the thread started, by
      // phone tail, then link it so the Details panel and title show the name.
      const dig = (p: string) => (p || '').replace(/\D/g, '')
      const tail = dig((conv as any).sms_number).slice(-9)
      let matched: any = null
      if (tail.length >= 8 && companyId) {
        const { data: cand } = await (supabase as any).from('contacts').select('*').eq('company_id', companyId).ilike('phone', `%${tail}%`).limit(10)
        matched = (cand || []).find((ct: any) => ct.phone && dig(ct.phone).endsWith(tail)) || null
        if (selectedRef.current?.id !== conv.id) return
      }
      if (matched) {
        resolvedEmail = matched.email || null
        resolvedPhone = matched.phone || null
        setContact(matched); setEditContact(matched)
        // Persist the link in the background — nothing below needs to wait on it.
        ;(supabase as any).from('conversations').update({ contact_id: matched.id }).eq('id', conv.id).then(() => {}, () => {})
        ;(conv as any).contact_id = matched.id
        setSelected(s => (s && s.id === conv.id ? ({ ...s, contact_id: matched.id } as any) : s))
        const withContact = (c: any) => c.id === conv.id ? ({ ...c, contact_id: matched.id, contacts: matched } as any) : c
        setConversations(prev => prev.map(withContact))
        // A row pulled in by a search or a pin lives in its own list.
        setSearchExtraConvs(prev => prev.map(withContact))
        setPinnedExtraConvs(prev => prev.map(withContact))
        if ((matched.email || matched.phone)) {
          // Fire-and-forget — keep it off the Order History panel's critical path.
          ;(async () => {
            try {
              const params = new URLSearchParams({ companyId })
              if (matched.email) params.set('email', matched.email)
              if (matched.phone) params.set('phone', matched.phone)
              const res = await authFetch(`/api/doa/match?${params.toString()}`)
              const data = await res.json()
              if (data.match) setDoaMatch(true)
            } catch {}
          })()
        }
      } else {
        setContact(null)
        // "+ Create" starts with the number they texted/called from.
        setEditContact((conv as any).sms_number ? { phone: (conv as any).sms_number } : {})
      }
    }
    // (Timeline events, notes and tasks were already requested at the top.)
    // Load WooCommerce data if the contact's email matches an order. Hand over
    // the email/phone we already resolved above so the panel skips a redundant
    // contacts lookup on its critical path.
    loadWooData((conv as any).contact_id, resolvedEmail, resolvedPhone)
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
      ;(['phone', 'email', 'address', 'name'] as const).forEach(k => {
        const v = (extracted as any)[k]
        if (v && !convDismissed.includes(v)) filtered[k] = v
      })
      if (filtered.phone || filtered.email || filtered.address || filtered.name) {
        // Auto-save any detected field the contact doesn't already have, and
        // remember which fields AI filled (to show the AI badge).
        ;(['phone', 'email', 'address', 'name'] as const).forEach(async (k) => {
          const val = filtered[k]
          if (!val) return
          // The joined contact row lives on `contacts` (there is no `__contact`).
          let already = (conv as any).contacts?.[k] // may be undefined
          // A contact auto-created from a chat gets a placeholder name
          // ("Visitor", or the raw phone number). Those aren't real names, so
          // let a detected one replace them.
          if (k === 'name' && already) {
            const placeholder = /^(visitor|guest|unknown|customer)$/i.test(String(already).trim())
              || /^\+?\d[\d\s()-]{6,}$/.test(String(already).trim())
            if (placeholder) already = null
          }
          if (!already) {
            try { await autoSaveAiField(conv, k, val) } catch {}
          }
        })
        setAiDetected(filtered)
      }
      else setAiDetected(null)
    }, 300)
  }

  const loadWooData = async (contactId: string | null, knownEmail?: string | null, knownPhone?: string | null) => {
    const seq = ++wooSeqRef.current
    const isCurrent = () => wooSeqRef.current === seq

    // Show what we already have for this contact immediately, then refresh
    // behind it — the panel stops flashing empty on every switch.
    const cached = contactId ? wooCacheRef.current.get(contactId) : null
    if (cached) {
      setWooCustomer(cached.customer)
      setWooOrders(cached.orders)
      setAbandonedCarts(cached.carts)
    } else {
      setWooCustomer(null)
      setWooOrders([])
      setAbandonedCarts([])
    }
    // Show a spinner only when we have nothing to display yet; a cached hit is
    // refreshed silently behind the existing rows. Also clears any stale flag
    // from a prior contact whose load lost the race.
    setWooOrdersLoading(!cached)
    if (!companyId) { setWooOrdersLoading(false); return }
    // Resolve the contact's email + phone. The caller almost always already
    // holds these (the contact card is loaded), so use them directly and skip a
    // whole round trip. Only hit the DB when nothing was handed to us — e.g. a
    // realtime event carrying just a contact id.
    let email: string | null = knownEmail || null
    let phone: string | null = knownPhone || null
    if (contactId && !email && !phone) {
      const { data: c } = await (supabase as any).from('contacts').select('email, phone, identity_group_id').eq('id', contactId).maybeSingle()
      email = c?.email || null
      phone = c?.phone || null
      // Identity propagation: if this contact is linked to others (same person
      // across channels), inherit an email/phone from the group so a Messenger
      // or Instagram contact — which has neither — still shows the order history
      // and cards tied to their matched email/phone.
      if ((!email || !phone) && c?.identity_group_id) {
        const { data: linked } = await (supabase as any).from('contacts')
          .select('email, phone').eq('identity_group_id', c.identity_group_id)
        for (const lc of linked || []) {
          if (!email && lc.email) email = lc.email
          if (!phone && lc.phone) phone = lc.phone
        }
      }
    }
    if (!email && !phone) { setWooOrdersLoading(false); return }
    // Abandoned carts match by email or phone (independent of WooCommerce sync).
    // Run it in the BACKGROUND — it used to be awaited before the order query,
    // so a slow carts endpoint delayed the whole Order History panel. It now
    // resolves on its own and merges into state/cache when ready.
    if (email || phone) {
      ;(async () => {
        try {
          const p = new URLSearchParams({ companyId })
          if (email) p.set('email', email); else if (phone) p.set('phone', phone)
          const res = await authFetch(`/api/abandoned-carts?${p}`)
          const data = await res.json()
          if (!isCurrent()) return
          setAbandonedCarts(data.carts || [])
          if (contactId) {
            const prev = wooCacheRef.current.get(contactId)
            wooCacheRef.current.set(contactId, {
              customer: prev?.customer || null, orders: prev?.orders || [], carts: data.carts || [],
            })
          }
        } catch {}
      })()
    }
    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
    // Shopify orders live in the operational orders table. Shape them like the
    // WooCommerce rows this panel renders (WooCommerce status words, so the
    // badges work; line_items[].image.src; billing) and tag them so the
    // WooCommerce-only actions and enrichment leave them alone.
    const shopifyOrders = async (e: string | null, p: string | null): Promise<any[]> => {
      if (!e && !p) return []
      const or = [e ? `customer_email.eq.${e.toLowerCase()}` : '', p && norm(p).length >= 8 ? `customer_phone_norm.eq.${norm(p)}` : ''].filter(Boolean).join(',')
      if (!or) return []
      const { data, error } = await (supabase as any).from('orders')
        .select('id, external_order_id, order_number, status, payment_status, fulfilment_status, total, currency, order_date, customer_email, customer_name, customer_phone, shipping_address, shipping_method, shipping_total, metadata, order_items(product_name, quantity, sku, total_price, image_url, product_id)')
        .eq('company_id', companyId).eq('sales_channel', 'shopify').or(or)
        .order('order_date', { ascending: false }).limit(50)
      if (error) return []
      const panelStatus = (r: any) => r.status === 'cancelled' ? 'cancelled'
        : (r.status === 'refunded' || r.payment_status === 'refunded') ? 'refunded'
        : r.payment_status === 'failed' ? 'failed'
        : (r.status === 'shipped' || r.status === 'delivered' || r.fulfilment_status === 'fulfilled') ? 'completed'
        : r.payment_status === 'pending' ? 'pending' : 'processing'
      return (data || []).map((r: any) => ({
        id: r.id, woo_order_id: `shopify-${r.external_order_id}`, order_number: r.order_number,
        status: panelStatus(r), total: r.total, currency: r.currency, order_date: r.order_date,
        customer_email: r.customer_email, customer_name: r.customer_name, billing: r.shipping_address || null,
        shipping_method: r.shipping_method, shipping_total: r.shipping_total, total_refunded: Number(r.metadata?.shopify?.refunded) || 0,
        line_items: (r.order_items || []).map((li: any) => ({ name: li.product_name, quantity: li.quantity, sku: li.sku, total: li.total_price, product_id: li.product_id, image: li.image_url ? { src: li.image_url } : null })),
        _channel: 'shopify', shop: r.metadata?.shopify?.shop || null, status_url: r.metadata?.shopify?.status_url || null, external_order_id: r.external_order_id,
      }))
    }
    // The Shopify customer for the card when there's no WooCommerce one.
    const shopifyCustomer = async (e: string | null, p: string | null) => {
      let q = (supabase as any).from('shopify_customers').select('*').eq('company_id', companyId)
      if (e) q = q.eq('email', e.toLowerCase()); else if (p && norm(p).length >= 8) q = q.eq('phone_norm', norm(p)); else return null
      const { data } = await q.limit(1)
      return data?.[0] ? { ...data[0], _channel: 'shopify' } : null
    }
    // Look orders up by email. Prefer the index-backed normalised column
    // (V265) — an exact eq the (company_id, customer_email_norm) index serves
    // directly — instead of a case-insensitive ilike, which can't use the index
    // and scans every one of the company's orders (the "always slow" cause). If
    // that column isn't there yet (migration not run), fall back to ilike once
    // and remember, so we don't probe on every load.
    const ordersByEmail = async (e: string) => {
      const base = () => (supabase as any).from('woocommerce_orders').select('*').eq('company_id', companyId)
      if (wooEmailNormRef.current !== false) {
        const res = await base().eq('customer_email_norm', e.toLowerCase()).order('order_date', { ascending: false }).limit(50)
        if (!res.error) { wooEmailNormRef.current = true; return res }
        wooEmailNormRef.current = false   // column absent → stop trying it
      }
      return await base().ilike('customer_email', e).order('order_date', { ascending: false }).limit(50)
    }
    const ordersByPhone = (p: string) => (supabase as any).from('woocommerce_orders')
      .select('*').eq('company_id', companyId).eq('billing_phone_norm', norm(p))
      .order('order_date', { ascending: false }).limit(50)

    // Fetch the WooCommerce customer row (spend/orders totals for the card).
    // This is NOT on the order-history critical path, so run it fully detached —
    // orders render the moment their own query returns, and the customer card
    // fills in whenever it lands.
    let ordersPromise: Promise<any[]>
    if (email) {
      ordersPromise = Promise.all([ordersByEmail(email), phone ? ordersByPhone(phone) : Promise.resolve({ data: [] })])
      ;(async () => {
        const { data: wooRow } = await (supabase as any).from('woocommerce_customers')
          .select('*').eq('company_id', companyId).ilike('email', email as string).maybeSingle()
        const data = wooRow || await shopifyCustomer(email, phone).catch(() => null)
        if (!isCurrent() || !data) return
        setWooCustomer(data)
        if (contactId) {
          const prev = wooCacheRef.current.get(contactId)
          wooCacheRef.current.set(contactId, { customer: data, orders: prev?.orders || [], carts: prev?.carts || [] })
        }
      })()
    } else if (phone) {
      // Phone-only (SMS contact with no email on file): resolve the customer
      // first, since it may backfill an email we then match orders on. Uses the
      // indexed normalised column from the V186 migration.
      const { data } = await (supabase as any).from('woocommerce_customers')
        .select('*').eq('company_id', companyId).eq('phone_norm', norm(phone)).maybeSingle()
      const woo = data || await shopifyCustomer(null, phone).catch(() => null)
      if (!isCurrent()) return
      if (woo) setWooCustomer(woo)
      if (woo?.email && contactId) {
        try { await (supabase as any).from('contacts').update({ email: woo.email }).eq('id', contactId).is('email', null) } catch {}
        email = woo.email
      }
      ordersPromise = Promise.all([email ? ordersByEmail(email) : Promise.resolve({ data: [] }), ordersByPhone(phone)])
    } else {
      ordersPromise = Promise.resolve([{ data: [] }, { data: [] }])
    }
    if (!isCurrent()) return

    // Orders by email (covers guest orders too), and ALSO by phone via billing.
    let orders: any[] = []
    const [byEmailRes, byPhoneRes] = await ordersPromise
    if (!isCurrent()) return
    orders = byEmailRes.data || []
    if (phone) {
      // Phone-matched orders via the indexed normalised column (V186 migration)
      // — no client-side scan of recent orders.
      const byPhone = byPhoneRes.data
      // Dedupe on the columns this table actually has. It previously keyed on
      // order_number/order_id, neither of which exist here, so every phone-
      // matched order stringified to "undefined" — the first one was kept and
      // the rest silently dropped, which is why orders sometimes didn't appear.
      const keyOf = (o: any) => String(o.woo_order_id ?? o.id ?? '')
      const seen = new Set(orders.map(keyOf))
      for (const o of (byPhone || [])) {
        const k = keyOf(o)
        if (k && !seen.has(k)) {
          seen.add(k)
          orders.push(o)
        }
      }
      orders.sort((a: any, b: any) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime())
    }
    try {
      const shop = await shopifyOrders(email, phone)
      if (shop.length) {
        orders = [...orders, ...shop].sort((a: any, b: any) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime())
      }
    } catch {}
    if (!isCurrent()) return
    setWooOrders(orders)
    setWooOrdersLoading(false)
    if (contactId) {
      // Keep whatever customer row the detached lookup may have already cached.
      const prev = wooCacheRef.current.get(contactId)
      wooCacheRef.current.set(contactId, { customer: prev?.customer || null, orders, carts: prev?.carts || [] })
    }
    // Live WooCommerce fetch runs in the background (don't block the panel — the
    // synced orders above already render instantly; live results merge in when
    // ready, catching Colvy-created orders that haven't synced yet).
    if (email) {
      ;(async () => {
      try {
        const res = await authFetch(`/api/orders/list?companyId=${companyId}&email=${encodeURIComponent(email!)}`)
        const data = await res.json()
        if (data.orders && data.orders.length > 0) {
          // Synced rows carry woo_order_id; live ones carry `number`. Keying the
          // synced set on the non-existent order_number/order_id meant nothing
          // matched, so every live order was appended again as a duplicate.
          const seen = new Set(
            (orders || []).map((o: any) => String(o.woo_order_id ?? o.order_number ?? o.id ?? '')).filter(Boolean)
          )
          const merged = [...(orders || [])]
          data.orders.forEach((o: any) => {
            const key = String(o.number)
            if (!seen.has(key)) {
              seen.add(key)
              merged.push({
                order_id: o.id, order_number: o.number, status: o.status, total: o.total,
                currency: o.currency, order_date: o.date, customer_email: email,
                line_items: o.items, integration_id: o.integration_id, store_url: o.store_url,
                shipping_total: o.shipping_total ?? null, shipping_method: o.shipping_method ?? null,
                order_key: o.order_key, payment_url: o.payment_url, total_refunded: o.total_refunded || 0, _live: true,
              })
            }
          })
          merged.sort((a: any, b: any) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime())
          // The live call is the slowest step; by the time it returns the agent
          // may have moved to another chat. Only write if this is still theirs.
          if (!isCurrent()) return
          setWooOrders(merged)
          if (contactId) {
            const prev = wooCacheRef.current.get(contactId)
            wooCacheRef.current.set(contactId, { customer: prev?.customer || null, orders: merged, carts: prev?.carts || [] })
          }
        }
      } catch {}
      })()
    }
  }

  const loadConversationExtras = async (convId: string) => {
    const [{ data: evts }, { data: nts }, { data: tsks }] = await Promise.all([
      (supabase as any).from('conversation_events').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }),
      (supabase as any).from('conversation_notes').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }),
      (supabase as any).from('conversation_tasks').select('*').eq('conversation_id', convId).order('created_at', { ascending: false }),
    ])
    // Moved to another chat while this loaded: don't show this one's timeline there.
    if (selectedIdRef.current !== convId) return
    setEvents(evts || [])
    setNotes(nts || [])
    setTasks(tsks || [])
  }

  const logEvent = async (eventType: string, detail: string) => {
    if (!selected || !companyId) return
    const actorName = myName
    await (supabase as any).from('conversation_events').insert({
      conversation_id: selected.id, company_id: companyId, event_type: eventType, actor_name: actorName, detail,
    })
    loadConversationExtras(selected.id)
  }

  // Record a Colvy AI action as an inline sparkle divider in the thread.
  const logAiUpdate = async (detail: string) => {
    if (!selected || !companyId) return
    try {
      await (supabase as any).from('conversation_events').insert({
        conversation_id: selected.id, company_id: companyId, event_type: 'ai_update', actor_name: 'Colvy AI', detail,
      })
      loadConversationExtras(selected.id)
    } catch {}
  }
  const onAiTasksCreated = () => {
    if (!selected) return
    loadConversationExtras(selected.id)
    logAiUpdate('Tasks created from the AI call summary')
  }

  const markMessagesRead = async (convId: string, msgs: Message[]) => {
    const me = myName
    const initial = initialsOf(me)
    const avatar = user?.user_metadata?.avatar_url || null   // show a real photo on the read receipt
    // Stamp read_by on every message this agent has now seen — including other
    // agents' replies. "Did my colleague see this?" is the question people
    // actually have, and previously only customer messages were stamped.
    const todo: { m: Message; updated: any[] }[] = []
    for (const m of msgs) {
      if (m.sender_type === 'system') continue
      // Tenant isolation. A receipt written without a company cannot be
      // attributed afterwards, and an unattributable receipt is exactly what
      // put one workspace's name on another workspace's conversation.
      if (!companyId) continue
      if ((m as any).company_id && (m as any).company_id !== companyId) continue
      // Don't mark your own message as read by yourself — that's meaningless.
      if (m.sender_type === 'agent' && (m as any).sender_id === user?.id) continue
      const readBy = Array.isArray((m as any).read_by) ? (m as any).read_by : []
      // Match on the reader's id first. Matching on the display name alone
      // collapsed two different people who share one, and failed to recognise
      // the same person signed in under a second login.
      if (readBy.some((r: any) => (r.id && r.id === user?.id) || (!r.id && r.name === me))) continue
      const updated = [...readBy, {
        id: user?.id || null, company_id: companyId,
        name: me, initial, at: new Date().toISOString(), ...(avatar ? { avatar } : {}),
      }]
      todo.push({ m, updated })
    }
    // One row per message (each has its own read_by array), but a few at a time
    // rather than strictly one after another — a long unread history used to
    // take one full round trip per message to settle.
    await runPool(todo, 6, ({ m, updated }) => (supabase as any).from('messages').update({
      read_by: updated,
      ...(m.sender_type === 'visitor' ? { is_read: true } : {}),
    }).eq('id', m.id))
  }

  /**
   * Which read receipts belong on this workspace's thread.
   *
   * read_by is a JSON array that anyone who can write the row appends to, and
   * receipts written before this carried no company at all — so the array can
   * hold readers from a workspace that has nothing to do with this
   * conversation. Rendering it raw put "Aqua Circle" under Roxy Aquarium's
   * customer messages.
   *
   * A receipt is shown when it says it belongs to this company, or — for the
   * older ones that say nothing — when the reader is demonstrably on this
   * company's team. Anything that cannot be placed is dropped. Hiding a
   * colleague's receipt is a cosmetic loss; showing another company's name on a
   * customer conversation is not.
   */
  const visibleReadBy = (raw: any, msgCompanyId?: string | null) => {
    const list = Array.isArray(raw) ? raw : []
    const own = msgCompanyId || companyId
    if (!own) return []
    return list.filter((r: any) => {
      if (r?.company_id) return r.company_id === own
      if (r?.id && r.id === user?.id) return true
      if (r?.id) return teamMembers.some((m: any) => (m.user_id || m.id) === r.id)
      const n = String(r?.name || '').trim().toLowerCase()
      return !!n && teamMembers.some((m: any) => String(m.name || m.email || '').trim().toLowerCase() === n)
    })
  }

  // ── Reactions ──────────────────────────────────────────────────────────────
  const reactToMessage = async (msg: Message, emoji: string) => {
    const me = myName
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
      const res = await authFetch(`/api/media?companyId=${companyId}`)
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
    const res = await authFetch(`/api/media?${params}`)
    const data = await res.json()
    setGalleryItems(data.items || [])
  }

  // Where should an SMS go? Prefer the number the conversation came in on, but
  // fall back to the contact's mobile — otherwise a chat-originated conversation
  // could never receive media/links by text even when we know their number.
  const smsDestination = (): string | null => {
    // Resolve the customer's mobile from every place it might live, so a reply
    // never silently falls back to "Live Chat" (which goes nowhere on a
    // widget-less account) just because one field was empty.
    const s = selected as any
    return s?.sms_number
      || s?.phone
      || contact?.phone
      || s?.contacts?.phone
      || null
  }

  // ── Channel-aware delivery for actions ──────────────────────────────────────
  // Coupons, payment links, forms, DOA claims, proof of delivery, etc. all
  // ultimately give the customer a LINK. On the live-chat widget we can render a
  // rich card, but on email / SMS / Messenger / Instagram we can only send text
  // — so those channels get a short message with the link. This one helper
  // routes to the right channel so every action doesn't reimplement it.
  //
  // Returns a human string describing what happened (for a toast), or throws.
  // Deliver a message/link over the customer's active channel. When `silent` is
  // set, the caller has ALREADY recorded a thread message (e.g. a payment /
  // save-card card with the right delivery_channel), so we just push the link out
  // (skipChatMessage) without inserting a duplicate — and skip the widget insert.
  // checkOptOut: the text is something staff send in one click (a coupon), so it
  // gets the opt-out check automated texts get (/api/telnyx/sms/send).
  const deliverToCustomer = async (opts: { body: string; url?: string | null; subject?: string; silent?: boolean; checkOptOut?: boolean }): Promise<string> => {
    if (!selected || !companyId) throw new Error('No conversation selected')
    const me = myName
    const ch = composeChannel()
    const fullBody = opts.url ? `${opts.body}\n${opts.url}` : opts.body

    if (ch === 'email') {
      const res = await authFetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: fullBody, agentName: me, subject: opts.subject }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Email failed')
      return 'Sent by email'
    }

    if (ch === 'instagram' || ch === 'facebook') {
      const res = await authFetch('/api/meta/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: fullBody, agentName: me, skipChatMessage: !!opts.silent }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Message failed')
      return ch === 'instagram' ? 'Sent on Instagram' : 'Sent on Messenger'
    }

    // WhatsApp: free text inside the 24-hour window only (the server refuses
    // it after that, and the composer offers a template instead).
    if (ch === 'whatsapp') {
      const res = await authFetch('/api/whatsapp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: fullBody, agentName: me, skipChatMessage: !!opts.silent }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'WhatsApp message failed')
      return 'Sent on WhatsApp'
    }

    const smsNumber = smsDestination()
    if (ch === 'sms' && smsNumber) {
      const res = await authFetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: fullBody, senderName: me, skipChatMessage: !!opts.silent, ...(opts.checkOptOut ? { checkOptOut: true } : {}) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'SMS failed')
      return 'Sent by SMS'
    }

    // Live-chat widget (or anything else). In silent mode the card is already in
    // the thread — just text a copy if we have a mobile; don't insert again.
    if (!opts.silent) {
      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_id: user?.id, sender_name: me, content: fullBody,
        delivery_channel: 'chat',
      })
      await (supabase as any).from('conversations').update({ last_message: opts.body.slice(0, 120), last_message_at: new Date().toISOString() }).eq('id', selected.id)
    }
    // A text copy when there's a mobile. Its failure used to be swallowed, so
    // the toast said "sent" for a text that never went.
    if (smsNumber) {
      let smsFailed = ''
      try {
        const res = await authFetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: fullBody, senderName: me, skipChatMessage: true, ...(opts.checkOptOut ? { checkOptOut: true } : {}) }),
        })
        if (!res.ok) smsFailed = (await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`
      } catch (e: any) { smsFailed = e?.message || 'Could not reach the SMS service' }
      if (smsFailed) return `Sent in chat, but the text didn’t go out (${smsFailed})`
    }
    return 'Sent in chat'
  }

  const sendingMediaRef = useRef(false)
  // ── Media expiry helpers ────────────────────────────────────────────────────
  // Resolve a per-item expiry code to an absolute timestamp at SEND time (so
  // "7 days" counts from when it's actually sent, not when it was picked).
  const resolveExpiry = (code?: string): string | null => {
    if (!code || code === 'forever') return null
    const day = 86400000
    if (code === '1d') return new Date(Date.now() + day).toISOString()
    if (code === '7d') return new Date(Date.now() + 7 * day).toISOString()
    if (code === '30d') return new Date(Date.now() + 30 * day).toISOString()
    // Custom date (yyyy-mm-dd) → end of that day.
    const d = new Date(`${code}T23:59:59`)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  // Short label for the selector chip on a staged card.
  const expiryChip = (code?: string): string => {
    if (!code || code === 'forever') return 'Keep forever'
    if (code === '1d') return '1 day'
    if (code === '7d') return '7 days'
    if (code === '30d') return '30 days'
    const d = new Date(`${code}T00:00:00`)
    return isNaN(d.getTime()) ? 'Keep forever' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  // Media picked from the Colvy gallery is already kept there, so it isn't
  // asked for an expiry; only new uploads (files, voice notes, QR photos) are.
  const expirable = stagedMedia.filter((m: any) => !m._fromGallery)
  const anyExpiring = expirable.some((m: any) => stagedExpiry[m.id] && stagedExpiry[m.id] !== 'forever')
  // Apply one expiry choice to every new upload at once.
  const applyBulkExpiry = (val: string) => {
    setStagedExpiry(prev => {
      const n = { ...prev }
      expirable.forEach((m: any) => { if (val === 'forever') delete n[m.id]; else n[m.id] = val })
      return n
    })
  }
  // The shared expiry code when every new upload agrees, else '' (mixed).
  const bulkExpiryCode = (() => {
    if (!expirable.length) return 'forever'
    const codes = expirable.map((m: any) => stagedExpiry[m.id] || 'forever')
    return codes.every(c => c === codes[0]) ? codes[0] : ''
  })()

  // Stage the picked gallery media as preview cards above the composer instead of
  // sending straight away. Nothing is delivered until Send is pressed.
  const stageSelectedMedia = () => {
    const chosen = galleryItems.filter(it => gallerySelected.has(it.id))
    if (chosen.length) {
      setStagedMedia(prev => {
        const have = new Set(prev.map((p: any) => p.id))
        return [...prev, ...chosen.filter((c: any) => !have.has(c.id)).map((c: any) => ({ ...c, _fromGallery: true }))]
      })
    }
    setGallerySelected(new Set())
    setShowMediaPicker(false)
  }

  // Normalise a staged item (gallery pick or uploaded file/voice note) into a
  // message attachment.
  const stagedToAttachment = (m: any) => m._attachment || {
    url: m.url, name: m.title || 'media',
    type: m.kind === 'video' ? 'video/mp4' : m.kind === 'audio' ? 'audio/webm' : 'image/jpeg',
    kind: m.kind,
    ...(m.thumbnail_url ? { thumbUrl: m.thumbnail_url } : {}),
  }

  // ── Voice notes ─────────────────────────────────────────────────────────────
  const fmtRec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  const startVoiceNote = async () => {
    if (recording || !selected || !companyId) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      recChunksRef.current = []
      recCancelRef.current = false
      mr.ondataavailable = (e: any) => { if (e.data && e.data.size) recChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (recCancelRef.current) { recChunksRef.current = []; return }
        const type = mr.mimeType || 'audio/webm'
        const blob = new Blob(recChunksRef.current, { type })
        recChunksRef.current = []
        if (!blob.size) return
        await stageVoiceNote(blob, type)
      }
      mediaRecRef.current = mr
      mr.start()
      setRecording(true); setRecSeconds(0)
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch {
      showToast('Could not access the microphone — check the browser permission.')
    }
  }

  const stopVoiceNote = (save: boolean) => {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    recCancelRef.current = !save
    setRecording(false)
    try { mediaRecRef.current?.stop() } catch {}
  }

  const stageVoiceNote = async (blob: Blob, type: string) => {
    if (!companyId || !selected) return
    const ext = /ogg/.test(type) ? 'ogg' : /mp4|m4a|aac/.test(type) ? 'm4a' : 'webm'
    const file = new File([blob], `voice-note.${ext}`, { type })
    setVoiceUploading(true)
    try {
      const a = await uploadAttachment(file, { companyId, conversationId: selected.id })
      const item: any = {
        id: `up_voice_${a.url || Math.random().toString(36).slice(2)}`,
        title: 'Voice note', kind: 'audio',
        url: a.url, thumbnail_url: '',
        _upload: true, _voice: true, _attachment: { ...a, kind: 'audio', name: 'Voice note' },
      }
      setStagedMedia(prev => [...prev, item])
    } catch {
      showToast('Could not save the voice note.')
    } finally { setVoiceUploading(false) }
  }

  // Stage photos/videos uploaded from a phone via the QR into the composer, so
  // they preview (and can carry an expiry) exactly like a gallery pick. Deduped
  // by URL so the poll re-delivering the same item can't double-stage it.
  const stageQrMedia = (items?: any[]) => {
    if (!items?.length) return
    setStagedMedia(prev => {
      const have = new Set(prev.map((p: any) => p.url).filter(Boolean))
      const add = items
        .filter((it: any) => it?.url && !have.has(it.url))
        .map((it: any) => ({
          id: `qr_${it.id || it.url}`,
          title: it.title || 'Photo',
          kind: it.kind || 'image',
          url: it.url,
          thumbnail_url: it.kind === 'video' ? '' : it.url,
        }))
      return add.length ? [...prev, ...add] : prev
    })
  }

  const deliverMedia = async (chosen: any[]) => {
    if (!companyId || !selected || chosen.length === 0) return
    // Guard against a double-fire (fast double-click / re-entry) — that sent the
    // same media into the thread twice.
    if (sendingMediaRef.current) return
    sendingMediaRef.current = true
    const me = myName
    // A WhatsApp thread gets the photo or video itself on WhatsApp, not a texted link.
    const onWhatsApp = activeChannel === 'whatsapp'
    const smsNumber = onWhatsApp ? null : smsDestination()
    try {
      for (const item of chosen) {
        const attachment: any = { url: item.url, name: item.title || 'media', type: item.kind === 'video' ? 'video/mp4' : 'image/jpeg', kind: item.kind, from_gallery: true }

        // Always deliver media over SMS as a branded /m/ viewer LINK, never a raw
        // MMS attachment — Australian numbers (and Telnyx) don't carry MMS, so an
        // attachment would silently vanish. The link renders the photo/video on a
        // branded page, is trackable, and can carry an expiry.
        const expiresAt: string | null = item._expiresAt || null
        let viewerUrl = ''
        try {
          const lr = await authFetch('/api/short-links/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, kind: 'media', conversationId: selected.id,
              url: item.url, mediaUrls: [attachment], label: attachment.name,
              sentBy: me, channel: 'gallery',
              ...(expiresAt ? { expiresAt, expiryMode: item._expiryMode || 'access' } : {}),
            }),
          })
          const ld = await lr.json()
          if (lr.ok && ld.url) viewerUrl = ld.url
        } catch { /* fall back to the raw url below */ }
        if (expiresAt) {
          attachment.expires_at = expiresAt
          attachment.expiry_mode = item._expiryMode || 'access'
        }
        if (viewerUrl) attachment.viewer_url = viewerUrl

        if (onWhatsApp) {
          try {
            const r = await authFetch('/api/whatsapp/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationId: selected.id, attachments: [{ url: item.url, kind: item.kind, name: attachment.name }], content: '', agentName: me, skipChatMessage: true }),
            })
            const rd = await r.json().catch(() => ({}))
            if (!r.ok) showToast(`Media saved to the chat, but WhatsApp didn’t send it: ${rd.error || 'unknown error'}`)
          } catch { showToast('Media saved, but WhatsApp didn’t send it.') }
        }
        // On an SMS conversation, TEXT the customer the viewer link (falling back
        // to the raw media URL only if the short link couldn't be created).
        if (smsNumber) {
          try {
            const r = await authFetch('/api/telnyx/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId, conversationId: selected.id, to: smsNumber,
                text: viewerUrl || item.url, attachments: [],
                senderName: me, skipChatMessage: true,
              }),
            })
            const rd = await r.json()
            // Don't hide a failed text — the agent thinks the customer got it.
            if (!r.ok) showToast(`Media saved to the chat, but the SMS failed: ${rd.error || 'unknown error'}`)
          } catch (e: any) { showToast('Media saved, but the SMS failed to send.') }
        }

        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_id: user.id, sender_name: me, sender_email: user.email,
          content: '', attachments: [attachment],
          delivery_channel: onWhatsApp ? 'whatsapp' : smsNumber ? 'sms' : 'chat',
        })
      }
      await (supabase as any).from('conversations').update({ last_message: '🖼️ Media', last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      await reloadThread(selected.id)
      scrollBottom()
    } catch (e: any) { showToast('Could not send media') }
    finally { sendingMediaRef.current = false }
  }

  // Deliver a batch of already-uploaded attachments to a conversation across the
  // right channel (SMS link / Meta / email / chat), inserting one thread message
  // that carries them. Extracted so it can run either straight after an upload
  // (documents) or from Send (staged media). Honors an optional media expiry.
  const deliverUploadedAttachments = async (
    attachments: any[],
    opts: { convId: string; smsNumber: string | null; metaCh: string; me: any; content?: string; expiresAt?: string | null; expiryMode?: string },
  ) => {
    const { convId, smsNumber, metaCh, me } = opts
    const expiresAt = opts.expiresAt || null
    const expiryMode = opts.expiryMode === 'delete' ? 'delete' : 'access'
    if (!attachments.length) return

    const media = attachments.filter(a => a.kind === 'image' || a.kind === 'video')
    const plainFiles = attachments.filter(a => a.kind !== 'image' && a.kind !== 'video')

    // One branded gallery link for all the media (carries the expiry, so its
    // access is revoked at expiry and SMS/email link there instead of the raw file).
    let galleryUrl = ''
    if (media.length > 0) {
      try {
        const res = await authFetch('/api/short-links/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, kind: 'media',
            url: media[0].url,
            mediaUrls: media,
            label: media.length > 1 ? `${media.length} photos` : (media[0].kind === 'video' ? 'Video' : 'Photo'),
            conversationId: convId,
            sentBy: me,
            ...(expiresAt ? { expiresAt, expiryMode } : {}),
          }),
        })
        const d = await readJsonSafe(res)
        if (res.ok && d.url) galleryUrl = d.url
        else console.warn('[media send] gallery link failed:', d.error)
      } catch (e) { console.warn('[media send] gallery link error:', e) }
    }

    // ── Deliver ────────────────────────────────────────────────────────
    if (metaCh === 'whatsapp') {
      // The files themselves, one WhatsApp message each (inside the 24-hour window).
      try {
        const r = await authFetch('/api/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: convId, attachments: attachments.map(a => ({ url: a.url, kind: a.kind, name: a.name, type: a.type })), content: opts.content || '', agentName: me, skipChatMessage: true }),
        })
        const rd = await readJsonSafe(r)
        if (!r.ok) showToast(`Saved to the chat, but WhatsApp didn’t send it: ${rd.error || 'unknown error'}`)
      } catch { showToast('Saved to the chat, but WhatsApp didn’t send it.') }
    } else if (smsNumber && !['instagram', 'facebook', 'email'].includes(metaCh)) {
      const parts: string[] = []
      if (galleryUrl) parts.push(galleryUrl)
      for (const f of plainFiles) parts.push(`📎 ${f.name}: ${f.url}`)
      try {
        const r = await authFetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, conversationId: convId, to: smsNumber,
            text: parts.join('\n'),
            attachments: [],
            senderName: me, skipChatMessage: true,
          }),
        })
        const rd = await readJsonSafe(r)
        if (!r.ok) showToast(`Saved to the chat, but the SMS failed: ${rd.error || 'unknown error'}`)
      } catch { showToast('Saved to the chat, but the SMS failed to send.') }
    } else if (metaCh === 'instagram' || metaCh === 'facebook') {
      for (const a of attachments) {
        try {
          const r = await authFetch('/api/meta/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId: convId, attachmentUrl: a.url, attachmentKind: a.kind,
              content: '', agentName: me, skipChatMessage: true,
            }),
          })
          const rd = await readJsonSafe(r)
          if (!r.ok) showToast(`Photo NOT delivered — ${rd.error || 'unknown error'}`)
        } catch (e: any) { showToast(`Photo NOT delivered: ${e?.message || 'send failed'}`) }
      }
    } else if (metaCh === 'email') {
      try {
        const body = galleryUrl
          ? `${media.length > 1 ? `${media.length} photos` : 'Photo'} attached:\n${galleryUrl}`
          : attachments.map(a => `${a.name}:\n${a.url}`).join('\n\n')
        const r = await authFetch('/api/email/reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: convId, agentName: me, content: body }),
        })
        const rd = await readJsonSafe(r)
        if (!r.ok) showToast(`Email NOT sent — ${rd.error || 'unknown error'}`)
      } catch (e: any) { showToast(`Email NOT sent: ${e?.message || 'failed'}`) }
    }

    // Stamp the expiry onto each attachment so the thread shows the badge.
    const stamped = expiresAt
      ? attachments.map(a => ({ ...a, expires_at: expiresAt, expiry_mode: expiryMode, ...(galleryUrl ? { viewer_url: galleryUrl } : {}) }))
      : attachments

    // ── One message carrying all of it ─────────────────────────────────
    const { data: attMsg } = await (supabase as any).from('messages').insert({
      conversation_id: convId, company_id: companyId, sender_type: 'agent',
      sender_id: user.id, sender_name: me, sender_email: user.email,
      content: plainFiles.length && !media.length ? plainFiles.map(f => `📎 ${f.name}`).join('\n') : '',
      attachments: stamped,
      metadata: galleryUrl ? { gallery_url: galleryUrl } : {},
      delivery_channel: ['instagram', 'facebook', 'email', 'whatsapp'].includes(metaCh) ? metaCh : (smsNumber ? 'sms' : 'chat'),
    }).select().maybeSingle()
    if (attMsg) broadcastMessage(convId, attMsg)

    await (supabase as any).from('conversations').update({
      last_message: media.length ? (media.length > 1 ? `🖼️ ${media.length} photos` : '🖼️ Photo') : '📎 Attachment',
      last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', convId)

    // Only refresh the thread if the agent is still looking at it.
    if (selectedRef.current?.id === convId) {
      await reloadThread(convId)
      scrollBottom()
    }
    loadConversations()
  }

  // ── File upload ────────────────────────────────────────────────────────────
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selected || !companyId) return
    const me = myName

    // Capture: the agent may switch conversations before uploads settle.
    const conv = selected
    const convId = conv.id
    const smsNumber = smsDestination()
    const metaCh = activeChannel

    const arr = Array.from(files)
    const isMedia = (f: File) => /^image\//.test(f.type) || /^video\//.test(f.type)
    const mediaFiles = arr.filter(isMedia)
    const docFiles = arr.filter(f => !isMedia(f))

    // Media → STAGE as preview cards above the composer once uploaded, and send
    // only when the agent presses Send (with any typed caption / chosen expiry).
    // Matches how the gallery picker attaches media.
    if (mediaFiles.length) {
      uploadQueue.enqueue(
        mediaFiles,
        { companyId, conversationId: convId },
        async (attachments, failed) => {
          if (failed.length) showToast(`Upload failed: ${failed[0].error || 'unknown error'}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ''}`)
          if (!attachments.length) return
          // If the agent has since moved to another conversation, staging into
          // the current view would be wrong — deliver to the original thread
          // instead so nothing is lost.
          if (selectedRef.current?.id !== convId) {
            await deliverUploadedAttachments(attachments, { convId, smsNumber, metaCh, me })
            return
          }
          const staged = attachments.map((a: any, i: number) => ({
            id: `up_${i}_${a.url || a.name}`,
            title: a.name || 'media',
            kind: a.kind,
            url: a.url,
            thumbnail_url: a.thumbUrl || a.url,
            _upload: true,
            _attachment: a,
          }))
          setStagedMedia(prev => {
            const have = new Set(prev.map((p: any) => p.id))
            return [...prev, ...staged.filter((s: any) => !have.has(s.id))]
          })
        },
      )
    }

    // Documents → STAGE as preview cards too (was: immediate send), so the agent
    // reviews the file before pressing Send, exactly like media. They deliver
    // through the same uploaded-attachment path on Send.
    if (docFiles.length) {
      uploadQueue.enqueue(
        docFiles,
        { companyId, conversationId: convId },
        async (attachments, failed) => {
          if (failed.length) showToast(`Upload failed: ${failed[0].error || 'unknown error'}${failed.length > 1 ? ` (+${failed.length - 1} more)` : ''}`)
          if (attachments.length === 0) return
          // Agent moved on before the upload settled — deliver to the original
          // thread rather than staging into the wrong conversation.
          if (selectedRef.current?.id !== convId) {
            await deliverUploadedAttachments(attachments, { convId, smsNumber, metaCh, me })
            return
          }
          const staged = attachments.map((a: any, i: number) => ({
            id: `updoc_${i}_${a.url || a.name}`,
            title: a.name || 'file',
            kind: a.kind || 'file',
            url: a.url,
            thumbnail_url: a.thumbUrl || null,
            _upload: true,
            _attachment: a,
          }))
          setStagedMedia(prev => {
            const have = new Set(prev.map((p: any) => p.id))
            return [...prev, ...staged.filter((s: any) => !have.has(s.id))]
          })
        },
      )
    }
  }

  // ── Notes & Tasks ──────────────────────────────────────────────────────────
  const addNote = async () => {
    if (!newNote.trim() || !selected || !companyId) return
    const author = myName
    const body = newNote.trim()
    await (supabase as any).from('conversation_notes').insert({ conversation_id: selected.id, company_id: companyId, author_name: author, content: body })
    // Notify anyone @mentioned in a sidebar note, same as an internal message —
    // mentions should work anywhere they can be typed.
    try {
      const ids = resolveMentions(body)
      if (ids.length) {
          await (supabase as any).from('mention_notifications').insert(
            ids.map((uid: string) => ({
              company_id: companyId, conversation_id: selected.id,
              mentioned_user: uid, mentioned_by: author, preview: body.slice(0, 140),
            }))
          )
          authFetch('/api/mentions/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: selected.id, userIds: ids,
              mentionedBy: author, preview: body.slice(0, 300),
              context: `a note on ${contact?.name || selected.subject || 'a conversation'}`,
            }),
          }).catch(() => {})
      }
    } catch { /* the note itself is saved either way */ }
    // Drop a lightweight timeline event so the thread shows "A note has been
    // created by …", the way Coax does.
    try {
      await (supabase as any).from('conversation_events').insert({
        conversation_id: selected.id, company_id: companyId,
        event_type: 'note_created', actor_name: author,
        detail: `A note has been created by ${author}`,
      })
    } catch { /* the note is saved regardless */ }
    setNewNote('')
    loadConversationExtras(selected.id)
  }

  const saveNoteEdit = async (id: string) => {
    const body = editNoteText.trim()
    if (!body) { setEditingNoteId(null); return }
    await (supabase as any).from('conversation_notes').update({ content: body }).eq('id', id)
    setEditingNoteId(null); setEditNoteText('')
    if (selected) loadConversationExtras(selected.id)
  }
  const deleteNote = async (id: string) => {
    if (!await confirmDialog('Delete this note?')) return
    await (supabase as any).from('conversation_notes').delete().eq('id', id)
    if (selected) loadConversationExtras(selected.id)
  }
  const copyNote = (content: string, id: string) => {
    try { navigator.clipboard.writeText(content || '') } catch {}
    setCopiedNoteId(id); showToast('Copied')
    setTimeout(() => setCopiedNoteId(c => (c === id ? null : c)), 1500)
  }

  // One Notes section, rendered in both the Information and Timeline tabs so
  // there's a single notes store (conversation_notes) shown in two places, with
  // @mention on add/edit and per-note copy / edit / delete.
  // Contact-card-style icon buttons (copy / edit / delete) shared by notes and
  // tasks so the two read identically.
  const rowActions = (o: { onCopy: () => void; onEdit: () => void; onDelete: () => void; copied?: boolean }) => (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      <button type="button" title="Copy" onClick={o.onCopy} style={fieldBtn(o.copied ? '#059669' : 'var(--slate)')}>
        {o.copied
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
      </button>
      <button type="button" title="Edit" onClick={o.onEdit} style={fieldBtn('var(--slate)')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button type="button" title="Delete" onClick={o.onDelete} style={fieldBtn('#dc2626')}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    </div>
  )

  // A composer with a round submit button tucked into the corner (Coax-style),
  // replacing the separate Add button. Enter submits single-line composers.
  const composerBox = (o: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; multiline?: boolean; rows?: number }) => {
    const active = !!o.value.trim()
    return (
    <div style={{ position: 'relative' }}>
      <MentionInput value={o.value} onChange={o.onChange} team={teamMembers as any}
        multiline={o.multiline} rows={o.rows} placeholder={o.placeholder} onSubmit={o.onSubmit}
        style={{ padding: '11px 46px 11px 13px', fontSize: 13, lineHeight: 1.5, borderRadius: 12 }} />
      <button type="button" onClick={o.onSubmit} title="Send" disabled={!active}
        style={{ position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: '50%', border: 'none', background: active ? 'var(--coral)' : '#eef0f2', color: active ? '#fff' : '#9aa1ab', cursor: active ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all 0.14s', boxShadow: active ? '0 1px 4px rgba(255,122,107,0.4)' : 'none' }}>
        {/* Return/enter arrow — matches the Coax composer affordance. */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>
      </button>
    </div>
    )
  }

  // Render plain message text with any URLs turned into clickable, selectable
  // links. Admin chat used to show tracking/short links as dead text that you
  // couldn't open or easily copy. Links inherit the bubble's colour and stay
  // underlined so they read as links on both agent and visitor bubbles.
  const renderTextWithLinks = (text: string) => {
    if (!text) return text
    // Highlight the active find term (in-conversation search, else the global
    // conversation search) inside the message body, not just in the list rows.
    const hq = (showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm
    const acc = companyInfo?.accent_color || 'var(--coral)'
    const parts = text.split(/(https?:\/\/[^\s]+)/g)
    return parts.map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: 'inherit', textDecoration: 'underline', wordBreak: 'break-all' }}>{part}</a>
      ) : (
        <span key={i}><Highlight text={part} q={hq} accent={acc} /></span>
      )
    )
  }

  const renderNotesSection = () => (
    <div style={{ marginBottom: 18 }}>
      <button type="button" onClick={() => setNotesOpen(v => !v)} aria-expanded={notesOpen}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: '0 0 8px', padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Notes</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, transform: notesOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.18s ease' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {notesOpen && <>
      {notes.map(n => (
        <div key={n.id} style={{ padding: '10px 12px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', marginBottom: 8 }}>
          {editingNoteId === n.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MentionInput value={editNoteText} onChange={setEditNoteText} team={teamMembers as any} multiline rows={3}
                placeholder="Edit note…" onSubmit={() => saveNoteEdit(n.id)} style={{ padding: '9px 11px', fontSize: 13, lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingNoteId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--slate)' }}>Cancel</button>
                <button type="button" onClick={() => saveNoteEdit(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#059669' }}>Save</button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{n.content}</p>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                <p style={{ margin: 0, fontSize: 10.5, color: '#9ca3af' }}>{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
                {rowActions({ onCopy: () => copyNote(n.content, n.id), onEdit: () => { setEditingNoteId(n.id); setEditNoteText(n.content) }, onDelete: () => deleteNote(n.id), copied: copiedNoteId === n.id })}
              </div>
            </>
          )}
        </div>
      ))}
      <div style={{ marginTop: 6 }}>
        {composerBox({ value: newNote, onChange: (v) => setNewNote(v), onSubmit: addNote, placeholder: 'Add a note… use @ to mention someone', multiline: true, rows: 2 })}
      </div>
      </>}
    </div>
  )
  const addTask = async () => {
    if (!newTask.trim() || !selected || !companyId) return
    const me = myName
    const assignee = teamMembers.find((m: any) => m.id === newTaskAssignee)
    // Anyone @mentioned in the text should hear about it too, not just the
    // person picked from the dropdown.
    const mentioned = resolveTeamMentions(newTask, teamMembers as any)

    // Carry the conversation's outlet onto the task, so it isn't a location-less
    // row that a teammate's home-outlet filter would hide on the Tasks board.
    const convLoc = (selected as any).assigned_location_id || (selected as any).location_id || null
    const { data: created } = await (supabase as any).from('conversation_tasks').insert({
      conversation_id: selected.id, company_id: companyId,
      text: newTask.trim(), done: false,
      assigned_to: assignee?.name || null,
      assigned_to_id: assignee?.id || null,
      created_by: me, created_by_id: user?.id || null,
      location_id: convLoc, location_ids: convLoc ? [convLoc] : [],
      mentions: (mentioned as any[]).map(m => ({ id: m.id, name: m.name })),
    }).select().maybeSingle()
    if (created?.id) notifyIntegrations('task.created', { id: created.id, companyId })

    // Notify the assignee and anyone mentioned (never yourself).
    const notify = new Map<string, string>()
    if (assignee?.user_id) notify.set(assignee.user_id, assignee.name)
    for (const m of mentioned as any[]) {
      const tm = teamMembers.find((t: any) => t.id === m.id || t.name === m.name)
      if (tm?.user_id) notify.set(tm.user_id, tm.name)
    }
    notify.delete(user?.id || '')
    // Through the server, which keeps only this workspace's staff (never a board
    // visitor or a removed member), instead of writing the rows from here. In-app
    // only, as before.
    const assigneeUid = assignee?.user_id || ''
    const groups: Array<[string[], string]> = [
      [Array.from(notify.keys()).filter(uid => uid === assigneeUid), `${me} assigned you a task`],
      [Array.from(notify.keys()).filter(uid => uid !== assigneeUid), `${me} mentioned you in a task`],
    ]
    for (const [userIds, title] of groups) {
      if (userIds.length === 0) continue
      try {
        await authFetch('/api/notify/members', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, userIds, type: 'task_assigned', title,
            body: newTask.trim().slice(0, 160),
            link: `/admin/inbox?conversation=${selected.id}`,
            channels: ['in_app'],
          }),
        })
      } catch { /* the task is saved regardless */ }
    }
    setNewTaskAssignee('')
    setNewTask('')
    loadConversationExtras(selected.id)
  }
  // The Tasks page reads `status` first (isDoneT), so ticking a task here
  // must move status and completed_at too, not just `done`.
  const taskDone = (t: any) => (t.status ? t.status === 'done' : !!t.done)
  const toggleTask = async (task: any) => {
    const done = !taskDone(task)
    const patch = { done, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...patch } : t))
    const { error } = await (supabase as any).from('conversation_tasks').update(patch).eq('id', task.id)
    // Before the status columns existed: keep the plain checkbox working.
    if (error) await (supabase as any).from('conversation_tasks').update({ done }).eq('id', task.id)
  }
  const saveTaskEdit = async (id: string) => {
    const body = editTaskText.trim()
    if (!body) { setEditingTaskId(null); return }
    await (supabase as any).from('conversation_tasks').update({ text: body }).eq('id', id)
    setEditingTaskId(null); setEditTaskText('')
    if (selected) loadConversationExtras(selected.id)
  }
  const deleteTask = async (id: string) => {
    if (!await confirmDialog('Delete this task?')) return
    await (supabase as any).from('conversation_tasks').delete().eq('id', id)
    if (selected) loadConversationExtras(selected.id)
  }
  const copyTask = (text: string, id: string) => {
    try { navigator.clipboard.writeText(text || '') } catch {}
    setCopiedTaskId(id); showToast('Copied')
    setTimeout(() => setCopiedTaskId(c => (c === id ? null : c)), 1500)
  }

  // One Tasks section, rendered in both the Information and Timeline tabs — same
  // conversation_tasks store, with assignment, @mention and copy/edit/delete.
  const renderTasksSection = () => (
    <div style={{ marginBottom: 18 }}>
      <button type="button" onClick={() => setTasksOpen(v => !v)} aria-expanded={tasksOpen}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', margin: '0 0 8px', padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Tasks</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, transform: tasksOpen ? 'none' : 'rotate(-90deg)', transition: 'transform 0.18s ease' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {tasksOpen && <>
      {tasks.map(t => (
        <div key={t.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', marginBottom: 8 }}>
          {editingTaskId === t.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <MentionInput value={editTaskText} onChange={setEditTaskText} team={teamMembers as any} multiline rows={2}
                placeholder="Edit task…" onSubmit={() => saveTaskEdit(t.id)} style={{ padding: '9px 11px', fontSize: 13, lineHeight: 1.5 }} />
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setEditingTaskId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--slate)' }}>Cancel</button>
                <button type="button" onClick={() => saveTaskEdit(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#059669' }}>Save</button>
              </div>
            </div>
          ) : (
            // Like a note: the task gets the card's full width; the labels and
            // copy/edit/delete share a row underneath (side by side, the three
            // buttons squeezed the text and the labels into a narrow column).
            <>
              <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={taskDone(t)} onChange={() => toggleTask(t)} style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, textDecoration: taskDone(t) ? 'line-through' : 'none', opacity: taskDone(t) ? 0.55 : 1, color: 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.text}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0, flex: 1 }}>
                  {t.assigned_to && (
                    <span title={t.assigned_to} style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 20, background: 'var(--peach)', color: 'var(--coral)', fontSize: 10.5, fontWeight: 700, lineHeight: 1.5 }}>
                      {t.assigned_to}
                    </span>
                  )}
                  {(t.source === 'call_summary' || t.source === 'ai_summary') && (
                    <span title="Drafted from an AI summary by Colvy" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', whiteSpace: 'nowrap', padding: '2px 8px', borderRadius: 20, background: '#f3e8ff', color: '#7c3aed', fontSize: 10.5, fontWeight: 700, lineHeight: 1.5 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}><path d="M12 2l2.2 6.3L20 10l-5.8 1.7L12 18l-2.2-6.3L4 10l5.8-1.7z"/></svg>
                      {t.source === 'call_summary' ? 'Call summary' : 'Chat summary'}
                    </span>
                  )}
                </div>
                {rowActions({ onCopy: () => copyTask(t.text, t.id), onEdit: () => { setEditingTaskId(t.id); setEditTaskText(t.text) }, onDelete: () => deleteTask(t.id), copied: copiedTaskId === t.id })}
              </div>
            </>
          )}
        </div>
      ))}
      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
        {composerBox({ value: newTask, onChange: (v) => setNewTask(v), onSubmit: addTask, placeholder: 'Add a task… use @ to mention someone (Enter to add)' })}
        <select value={newTaskAssignee} onChange={e => setNewTaskAssignee(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, outline: 'none', background: '#fff', color: newTaskAssignee ? 'var(--ink)' : 'var(--slate)' }}>
          <option value="">Unassigned</option>
          {teamMembers.map((m: any) => (<option key={m.id} value={m.id}>{m.name}</option>))}
        </select>
      </div>
      </>}
    </div>
  )

  // ── Sentiment ──────────────────────────────────────────────────────────────
  const setSentiment = async (sentiment: string | null) => {
    if (!selected) return
    const id = selected.id
    setSelected(s => s ? { ...s, sentiment } as any : s)
    // Keep the list's copy in step, so switching away and back shows it.
    setConversations(list => list.map(c => c.id === id ? { ...c, sentiment } as any : c))
    await (supabase as any).from('conversations').update({ sentiment }).eq('id', id)
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
  // The star opens "Ask for a review" (components/composer/ReviewRequestButton):
  // the message to check and edit, the channel it goes by, and an explicit Send
  // or Insert into reply. It used to send the moment the star was clicked.
  // Which channel: the conversation's current send channel; a text needs a
  // mobile and consent (STOP → email instead).
  // (Functions, read when the toolbar renders: sendChannel is declared further down.)
  const reviewChannel = (): ReviewChannel => {
    const c = contact as any
    const textStop = !!c?.unsubscribed_at && c?.unsubscribe_method === 'sms_keyword'
    return pickReviewChannel({
      current: sendChannel !== 'auto' ? sendChannel : outboundChannel,
      forced: sendChannel !== 'auto',
      mobile: smsDestination(),
      email: c?.email || (selected as any)?.customer_email || null,
      smsOptedOut: smsOptOut === 'opted_out' || textStop,   // STOP: texts only, email is still fine
      blocked: !!c?.is_blocked,
      unsubscribed: !!c?.unsubscribed_at && !textStop,      // any other unsubscribe: nothing
    })
  }
  const reviewAlready = (): string | null => {
    if (!(contactReviews.count > 0 && contactReviews.latest)) return null
    const r = contactReviews.latest
    const when = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
    return `${contact?.name || 'This customer'} already left a ${r.rating ? `${r.rating}-star ` : ''}Google review${when ? ` on ${when}` : ''}.`
  }
  // A branded short link to the business's Google review page, so the
  // customer gets company.colvy.com/m/xxxx (trustworthy in an SMS) that
  // redirects to Google. Made only when Send / Insert is clicked.
  const createReviewLink = async (): Promise<string | null> => {
    if (!selected || !companyId) return null
    const res = await authFetch('/api/short-links/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, kind: 'review', conversationId: selected.id }),
    })
    const d = await res.json().catch(() => ({}))
    if (res.ok && d.url) return d.url
    // 404 = no Google review link set up (say so); anything else is a retry.
    if (res.status === 404) return null
    throw new Error(d.error || 'Could not make the review link')
  }
  // Delivers the checked message over the chosen channel. Throws on failure so
  // the popover stays open and shows why.
  const sendReviewRequest = async (body: string, ch: ReviewChannel) => {
    if (!selected || !companyId) return
    const me = myName
    let delivered = 'chat'
    if (ch.kind === 'none') throw new Error(ch.note || 'No way to reach this customer')
    if (ch.kind === 'email') {
      // The email route inserts the thread message itself — pass the metadata
      // so it still renders as the review card. Don't also insert below.
      const r = await authFetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, to: ch.to || undefined, content: body, agentName: me, subject: REVIEW_REQUEST_SUBJECT, metadata: { review_request: true } }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(`Not emailed: ${d.error || 'failed'}`) }
      delivered = 'email'
    } else if (ch.kind === 'instagram' || ch.kind === 'facebook') {
      const r = await authFetch('/api/meta/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: body, agentName: me, skipChatMessage: true }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(`Not sent: ${d.error || 'failed'}`) }
      delivered = ch.kind
    } else if (ch.kind === 'sms') {
      // checkOptOut: the server refuses a number that replied STOP.
      const r = await authFetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, to: ch.to || smsDestination(), text: body, senderName: me, skipChatMessage: true, checkOptOut: true }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(`The text wasn't sent: ${d.error || 'unknown error'}`) }
      delivered = 'sms'
    }
    // else: live-chat widget only — the thread message below IS the delivery.

    // It has gone out. Nothing below may throw: an error here must not read as
    // a failed send (the agent would send it again).
    const convId = selected.id
    try {
      // For every channel except email (which already inserted its own row),
      // record the thread message with the review-card metadata + real channel.
      if (ch.kind !== 'email') {
        const { error } = await (supabase as any).from('messages').insert({
          conversation_id: convId, company_id: companyId, sender_type: 'agent',
          sender_id: user.id, sender_name: me,
          content: body,
          metadata: { review_request: true },
          delivery_channel: delivered,
        })
        if (error && ch.kind === 'chat') throw error   // on live chat this row IS the delivery
      }
      await (supabase as any).from('conversations').update({ review_requested: true, last_message_at: new Date().toISOString() }).eq('id', convId)
      logEvent('review_request', 'Review request sent')
    } catch (e: any) {
      if (ch.kind === 'chat') throw new Error(e?.message || 'Could not post the review request')
    }
    showToast(`Review request sent by ${ch.label}`)
    try { await reloadThread(convId); scrollBottom() } catch {}
  }

  // Chat composer emoji picker, anchored to its button (shared Popover).
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const shortenerAnchorRef = useRef<HTMLDivElement>(null)
  // Merge fields for saved replies: "Hi {first_name}" → "Hi Debra".
  const templateVars: TemplateVars = {
    name: contact?.name || null, email: contact?.email || null, phone: contact?.phone || null,
    company: companyInfo?.name || null, agent_name: myName || null,
  }

  // ── AI summary & todos ─────────────────────────────────────────────────────
  const generateAiSummary = async () => {
    if (!selected || messages.length === 0) return
    setGeneratingAi(true)
    try {
      // The summary covers the whole conversation. If only the newest page is
      // loaded in the thread, read every message's text for it (two columns).
      let source: { sender_type: string; content: string }[] = messages
      const win = threadWinRef.current
      if (win.convId === selected.id && win.since) {
        const { data: all } = await (supabase as any).from('messages').select('sender_type, content')
          .eq('conversation_id', selected.id).order('created_at', { ascending: true })
        if (all) source = all
      }
      const res = await authFetch('/api/inbox/ai-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId,
          conversationId: selected.id,
          messages: source.filter(m => m.sender_type !== 'system').map(m => ({ role: m.sender_type, content: m.content })),
        }),
      })
      const data = await res.json()
      if (data.summary) {
        setAiSummary(data.summary)
        setAiTodos(data.todos || [])
        // Freshly made: the draft card sits at this moment (it folds once the chat moves on).
        setChatDraftAnchor(todosGeneratedAt(data.todos) || Date.now())
        await (supabase as any).from('conversations').update({ ai_summary: data.summary, ai_todos: data.todos || [] }).eq('id', selected.id)
      } else if (data.error) {
        setAiSummary('AI summary unavailable: ' + data.error)
      }
    } catch (e: any) {
      setAiSummary('Could not generate summary.')
    }
    setGeneratingAi(false)
  }

  // The conversation-level draft-tasks panel (DraftTasks) manages its own
  // dismissal; we mirror its closed state so the plain to-do checklist only
  // shows once the panel is gone.
  const [chatDraftsClosed, setChatDraftsClosed] = useState(false)
  // Draft-task cards fold to one row once the chat has moved on past them
  // unused (newer customer/staff messages below), like the mobile app. The
  // chat-summary card's place in the thread is when it first appeared,
  // remembered per conversation.
  const latestChat = useMemo(() => latestChatMs(messages as any[]), [messages])
  // When the conversation's action items were generated (their `at`); items
  // saved before that existed fall back to when this browser first showed them.
  const [chatDraftAnchor, setChatDraftAnchor] = useState<number | null>(null)
  const draftAnchorFor = (convId: string, todos: any[]): number | null => {
    if (!todos?.length) return null
    const at = todosGeneratedAt(todos)
    if (at) return at
    const key = `colvy-draft-anchor-${convId}`
    try { const v = Number(window.localStorage.getItem(key)); if (v) return v } catch {}
    const now = Date.now()
    try { window.localStorage.setItem(key, String(now)) } catch {}
    return now
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

  // Buttery-smooth scroll to the newest message. We animate the scroll
  // container's scrollTop with an eased requestAnimationFrame loop (much smoother
  // than scrollIntoView, which stutters on long threads). For very long threads
  // we jump most of the way instantly, then animate the last stretch, so it's
  // fast AND smooth. A ResizeObserver keeps us pinned to the bottom while late
  // images load, so it never lands short.
  const scrollRaf = useRef<number | null>(null)
  const smoothScrollToBottom = (opts?: { instant?: boolean }) => {
    const el = messagesScrollRef.current
    if (!el) return
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    const target = () => el.scrollHeight - el.clientHeight
    if (opts?.instant) { el.scrollTop = target(); return }
    // If we're far from the bottom, jump close first so the animation is short.
    const remaining = target() - el.scrollTop
    if (remaining > 1200) el.scrollTop = target() - 1000
    const start = el.scrollTop
    const startTime = performance.now()
    const duration = 420
    const ease = (t: number) => 1 - Math.pow(1 - t, 3) // easeOutCubic
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration)
      el.scrollTop = start + (target() - start) * ease(t)
      if (t < 1) scrollRaf.current = requestAnimationFrame(step)
    }
    scrollRaf.current = requestAnimationFrame(step)
  }
  const scrollBottom = () => {
    // First settle instantly to the bottom, then a smooth pass, then catch late
    // layout growth (images) with a couple of instant re-pins.
    requestAnimationFrame(() => {
      smoothScrollToBottom()
      setTimeout(() => smoothScrollToBottom({ instant: true }), 350)
      setTimeout(() => smoothScrollToBottom({ instant: true }), 800)
    })
  }

  // ── Send reply ─────────────────────────────────────────────────────────────
  // Open a picker for poll/survey/form, loading the company's items
  const openPicker = async (kind: 'poll' | 'survey' | 'form' | 'payment') => {
    setShowSendMenu(false)
    setSendPicker(kind)
    setPickerItems([])
    if (kind === 'payment') return
    const table = kind === 'poll' ? 'polls' : kind === 'survey' ? 'surveys' : 'forms'
    // Only this workspace's (polls used to be read across every workspace here).
    if (!companyId) return
    const { data } = await (supabase as any).from(table).select('*').eq('company_id', companyId).order('created_at', { ascending: false }).limit(60)
    // Only live polls and surveys: a draft or closed one can't be answered in the chat.
    const { statusOf } = await import('@/lib/engage-core')
    setPickerItems(kind === 'form' ? (data || []).slice(0, 30) : (data || []).filter((r: any) => statusOf(r) === 'live').slice(0, 30))
  }

  const generateInvoice = async (payload: any) => {
    if (!companyId || !payload?.order_id) return
    try {
      const res = await authFetch(`/api/orders/details?companyId=${companyId}&orderId=${payload.order_id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load order')
      const { order, company } = data
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const W = 210, L = 16, R = W - 16
      const n = (v: any) => parseFloat(v || 0)
      const money = (v: any) => `$${n(v).toFixed(2)}`
      const RT = (t: string, x: number, y: number) => doc.text(t, x, y, { align: 'right' })
      const CT = (t: string, y: number) => doc.text(t, W / 2, y, { align: 'center' })

      // ── Header: business (left) + address/phone (right) ──
      let y = 20
      doc.setFontSize(15); doc.setFont('helvetica', 'bold')
      doc.text(company.name || 'Invoice', L, y)
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      if (company.abn_acn) { doc.text(`ABN ${company.abn_acn}`, L, y + 5) }
      // Right column: company address lines + phone.
      const addrLines = String(company.business_address || '').split(/\n|,\s*/).map(s => s.trim()).filter(Boolean)
      let ry = y
      doc.setFontSize(9)
      for (const line of addrLines.slice(0, 3)) { RT(line, R, ry); ry += 4.5 }
      const bizPhone = company.business_phone || company.business_mobile
      if (bizPhone) { RT(`Phone : ${bizPhone}`, R, ry); ry += 4.5 }

      // ── Customer (billing) ──
      const b = order.billing || {}
      y += 14
      doc.setFontSize(10); doc.setFont('helvetica', 'normal')
      const custName = `${b.first_name || ''} ${b.last_name || ''}`.trim()
      if (custName) { doc.text(custName, L, y); y += 5 }
      const custAddr = [b.address_1, b.address_2].filter(Boolean).join(' ')
      if (custAddr) { doc.text(custAddr, L, y); y += 5 }
      const cityLine = [b.city, b.state, b.country || 'Australia', b.postcode].filter(Boolean).join(', ')
      if (cityLine) { doc.text(cityLine, L, y); y += 5 }
      if (b.email) { doc.text(`Email : ${b.email}`, L, y); y += 5 }
      if (b.phone) { doc.text(`Phone : ${b.phone}`, L, y); y += 5 }

      // ── Title ──
      y += 8
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); CT('TAX INVOICE/RECEIPT', y); y += 6
      doc.setFontSize(9); doc.setFont('helvetica', 'normal')
      CT(`Invoice# ${order.number || order.id || ''}`, y); y += 4.5
      CT(new Date(order.date || Date.now()).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }), y); y += 8

      // ── Line items table ──
      const cUnit = 118, cEx = 143, cDisc = 168, cInc = R
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
      doc.text('Item', L, y); RT('Unit', cUnit, y); RT('Sales (ex)', cEx, y); RT('Disc', cDisc, y); RT('Sales (inc)', cInc, y)
      y += 2; doc.setDrawColor(200); doc.line(L, y, R, y); y += 5
      doc.setFont('helvetica', 'normal')
      for (const li of (order.line_items || [])) {
        const qty = n(li.quantity) || 1
        const ex = n(li.total)                        // ex-tax, after discount
        const inc = ex + n(li.total_tax)              // inc-tax
        const disc = Math.max(0, n(li.subtotal) - n(li.total))
        const unit = qty ? (inc + n(li.subtotal_tax) - n(li.total_tax)) / qty : inc // approx unit inc-tax
        const nameLines = doc.splitTextToSize(`${qty} X ${li.name}`, 95)
        doc.text(nameLines, L, y)
        RT(money(unit * qty), cUnit, y); RT(money(ex), cEx, y); RT(money(disc), cDisc, y); RT(money(inc), cInc, y)
        y += Math.max(nameLines.length * 4.5, 5) + 2
        if (y > 250) { doc.addPage(); y = 20 }
      }
      doc.setDrawColor(200); doc.line(L, y, R, y); y += 7

      // ── Totals ──
      const subtotal = n(order.total) - n(order.total_tax)
      const totRow = (label: string, val: string, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(bold ? 11 : 9.5)
        RT(label, cDisc, y); RT(val, cInc, y); y += bold ? 7 : 5.5
      }
      totRow('Discount', money(order.discount_total))
      totRow('Subtotal', money(subtotal))
      totRow('Tax (GST)', money(order.total_tax))
      totRow('Total', money(order.total), true)
      if (order.payment_method_title || order.payment_method) totRow(order.payment_method_title || order.payment_method, money(order.total))
      const outstanding = Math.max(0, n(order.total) - (order.date_paid || order.status === 'completed' || order.status === 'processing' ? n(order.total) : 0))
      y += 2; doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
      doc.text('Outstanding:', L, y); doc.text(money(outstanding), L + 40, y); y += 10

      // ── Invoice number + served by + footer ──
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
      CT(String(order.number || order.id || ''), y); y += 5
      const servedBy = (myName || company.name || '')
      if (servedBy) { CT(`Served by ${servedBy}`, y); y += 4.5 }
      CT(new Date().toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, day: '2-digit', month: 'short', year: 'numeric' }), y); y += 8
      const footer = company.invoice_footer || 'Thank you for the business.'
      doc.setFontSize(8.5); doc.setTextColor(90)
      const fLines = doc.splitTextToSize(footer, R - L)
      for (const fl of fLines) { CT(fl, y); y += 4 }
      doc.setTextColor(0)

      const fileName = `invoice-${order.number || order.id}.pdf`
      setInvoicePreview({ doc, url: URL.createObjectURL(doc.output('blob')), fileName, orderNumber: String(order.number || order.id) })
    } catch (e: any) { showToast(e.message || 'Could not generate invoice') }
  }

  const downloadInvoice = () => { if (invoicePreview) invoicePreview.doc.save(invoicePreview.fileName) }

  // Notify the customer their click-and-collect / local-pickup order is ready,
  // at a confirmed store location.
  const sendPickupReady = async () => {
    if (!pickupModal || !selected || !companyId) return
    setPickupSending(true)
    const smsNumber = smsDestination()
    try {
      const loc = outlets.find(o => o.id === pickupModal.locationId)
      const locName = loc ? [loc.label, loc.suburb].filter(Boolean).join(', ') : 'our store'
      const orderNo = pickupModal.payload.order_number || pickupModal.payload.order_id
      const first = contact?.name ? String(contact.name).split(' ')[0] : ''
      const text = `Hi${first ? ' ' + first : ''}, your order #${orderNo} is ready to be collected at: ${locName}. See you soon!`
      const me = myName
      if (smsNumber) {
        try {
          await authFetch('/api/telnyx/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text, senderName: me, skipChatMessage: true }),
          })
        } catch {}
      }
      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_id: user.id, sender_name: me, sender_email: user.email,
        content: text, delivery_channel: smsNumber ? 'sms' : 'chat',
      })
      await (supabase as any).from('conversations').update({ last_message: text, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      await reloadThread(selected.id)
      showToast('Pickup notification sent')
      setPickupModal(null); scrollBottom()
    } catch (e: any) {
      showToast(e.message || 'Could not send the notification')
    } finally { setPickupSending(false) }
  }

  // Enrich the orders shown in the panel with product images + shipping (the
  // synced rows lack both). The detail endpoint fetches live and caches, so this
  // runs once per order and then reads from cache.
  const enrichedOrdersRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!companyId || wooOrders.length === 0) return
    const toEnrich = wooOrders.filter((o: any) => {
      if (o._channel === 'shopify') return false   // already complete; not a WooCommerce order
      const id = String(o.order_id)
      if (!id || enrichedOrdersRef.current.has(id)) return false
      const needsImg = !Array.isArray(o.line_items) || o.line_items.some((li: any) => !li?.image?.src)
      const needsShip = o.shipping_total == null
      return needsImg || needsShip
    }).slice(0, 8)
    if (toEnrich.length === 0) return
    let cancelled = false
    ;(async () => {
      const updates: Record<string, any> = {}
      // Fetch the order details concurrently — this used to await each order in
      // turn, so N orders took N round-trips end to end before any image showed.
      await Promise.all(toEnrich.map(async (o: any) => {
        const id = String(o.order_id)
        enrichedOrdersRef.current.add(id)
        try {
          const res = await authFetch(`/api/orders/detail?companyId=${companyId}&orderId=${id}` + (o.integration_id ? `&integrationId=${o.integration_id}` : ''))
          const d = await res.json()
          if (res.ok && d.order) updates[id] = d.order
        } catch { /* leave this order as-is */ }
      }))
      if (cancelled || Object.keys(updates).length === 0) return
      setWooOrders(prev => prev.map((o: any) => {
        const u = updates[String(o.order_id)]
        return u ? { ...o, line_items: (Array.isArray(u.line_items) && u.line_items.length) ? u.line_items : o.line_items, shipping_total: u.shipping_total ?? o.shipping_total, shipping_method: u.shipping_method ?? o.shipping_method } : o
      }))
    })()
    return () => { cancelled = true }
  }, [wooOrders, companyId])

  const sendInvoiceInChat = async () => {
    if (!invoicePreview || !selected || !companyId) return
    setInvoiceSending(true)
    const smsNumber = smsDestination()
    try {
      const blob: Blob = invoicePreview.doc.output('blob')
      const file = new File([blob], invoicePreview.fileName, { type: 'application/pdf' })
      const up = await uploadAttachment(file, { companyId, conversationId: selected.id })
      const attachment = { url: up.url, name: up.name || invoicePreview.fileName, type: 'application/pdf', kind: 'file' }
      const me = myName
      // On an SMS conversation, text the customer a link to the invoice.
      if (smsNumber) {
        try {
          await authFetch('/api/telnyx/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: `Invoice #${invoicePreview.orderNumber}`, attachments: [attachment], senderName: me, skipChatMessage: true }),
          })
        } catch {}
      }
      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_id: user.id, sender_name: me, sender_email: user.email,
        content: `Invoice #${invoicePreview.orderNumber}`, attachments: [attachment],
        delivery_channel: smsNumber ? 'sms' : 'chat',
      })
      await (supabase as any).from('conversations').update({ last_message: '📄 Invoice', last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', selected.id)
      await reloadThread(selected.id)
      showToast('Invoice sent in chat')
      setInvoicePreview(null); scrollBottom()
    } catch (e: any) {
      showToast(e.message || 'Could not send the invoice')
    } finally { setInvoiceSending(false) }
  }

  // Mark a processing order as completed in WooCommerce. This usually triggers
  // the store's "order complete" email, so it confirms first.
  const markOrderCompleted = async (payload: any) => {
    if (!companyId) return
    const orderId = payload.order_id || payload.id
    if (!orderId) { showToast('No order id for this order'); return }
    const isShopify = /^shopify-/.test(String(orderId))
    if (!await confirmDialog(isShopify
      ? `Mark order #${payload.order_number || orderId} as completed?\n\nThis marks it paid (if it isn't yet) and fulfilled in Shopify.`
      : `Mark order #${payload.order_number || orderId} as completed?\n\nThis updates WooCommerce and may send the customer a completion email.`)) return
    try {
      const res = await authFetch('/api/orders/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, orderId, status: 'completed',
          integrationId: payload.integration_id || undefined,
          conversationId: selected?.id || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update the order')
      showToast(`Order #${payload.order_number || orderId} marked completed`)
      if (selected) { loadWooData(contact?.id || null, contact?.email, contact?.phone); loadConversationExtras(selected.id) }
    } catch (e: any) {
      alertDialog('Could not mark the order completed: ' + e.message)
    }
  }

  // Turn a pasted URL into a branded short link and drop it into the reply.
  const shortenIntoReply = async (insert?: (t: string) => void) => {
    const raw = shortenInput.trim()
    if (!raw || !companyId) return
    setShortenBusy(true); setShortenError('')
    try {
      const res = await authFetch('/api/short-links/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, kind: 'redirect', url: raw,
          conversationId: selected?.id || undefined,
          sentBy: myName || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not shorten that URL')
      if (insert) insert(d.url)
      else setReply(r => (r.trim() ? `${r.trimEnd()} ${d.url}` : d.url))
      setShowShortener(false); setShortenInput('')
    } catch (e: any) {
      setShortenError(e.message)
    } finally { setShortenBusy(false) }
  }

  // ── Composer action buttons ──────────────────────────────────────────────
  // Shared by the chat/SMS reply box and the email composer, so both have the
  // same tools: the + menu (poll, survey, form, payment link, charge/save card,
  // schedule delivery, request media), review request, short link and booking
  // link. Every send here is channel-aware (deliverToCustomer etc.), so on an
  // email thread it goes out by email. `insert` puts text (a short link, a
  // booking link) into whichever composer is showing; the voice note and
  // "Upload from your phone" stage media in the chat box, so they're chat-only.
  // Reply / Note switch on top of the reply box — shared by the chat box and
  // the email composer (on an email thread, Note swaps in the note box).
  const renderModeHead = () => (
                <div className="cmp-head">
                  {(() => {
                    // The Ticket tab is only there while a ticket is being written.
                    const tabs = ticketMode || ticketSubject.trim() || ticketDesc.trim() ? 3 : 2
                    const at = ticketMode ? 2 : internalMode ? 1 : 0
                    return (
                      <div className="cmp-mode" role="tablist" aria-label="Reply, internal note or ticket" style={tabs === 3 ? { gridTemplateColumns: '1fr 1fr 1fr' } : undefined}>
                        <span className="cmp-mode-thumb" style={{ width: tabs === 3 ? 'calc(33.333% - 2px)' : undefined, transform: at ? `translateX(${at * 100}%)` : 'none' }} />
                        <button type="button" role="tab" aria-selected={at === 0} onClick={() => { setTicketMode(false); setInternalMode(false) }}>Reply</button>
                        <button type="button" role="tab" aria-selected={at === 1} onClick={() => { setTicketMode(false); setInternalMode(true) }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
                          Note
                        </button>
                        {tabs === 3 && (
                          <button type="button" role="tab" aria-selected={at === 2} onClick={openTicket} className="cmp-mode-ticket">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z"/></svg>
                            Ticket
                          </button>
                        )}
                      </div>
                    )
                  })()}
                  <span className="cmp-via">
                    {ticketMode ? 'A support ticket, linked to this conversation' : internalMode ? 'Only your team sees this' : channelResolving ? 'Choosing a channel…' : <><span className="cmp-via-lbl">Sending by </span><b>{({ sms: 'SMS', email: 'email', chat: 'live chat', instagram: 'Instagram', messenger: 'Messenger', whatsapp: 'WhatsApp', call: 'SMS', colvy: 'Colvy app' } as Record<string, string>)[sendChannel !== 'auto' ? sendChannel : outboundChannel] || 'chat'}</b> {sendChannelGlyph(sendChannel !== 'auto' ? sendChannel : outboundChannel, 13)}</>}
                    {/* Both a mobile and an email: one tap to the other. */}
                    {!internalMode && !ticketMode && !channelResolving && (() => {
                      const cur = sendChannel !== 'auto' ? sendChannel : outboundChannel
                      const other = cur === 'email' && ((selected as any)?.sms_number || contact?.phone) ? 'sms' : cur === 'sms' && contact?.email ? 'email' : null
                      return other ? (
                        <button type="button" onClick={() => setSendChannel(other)} title={channelPick?.reason || undefined}
                          style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, color: 'var(--coral)', fontWeight: 700, fontSize: 'inherit', cursor: 'pointer', fontFamily: 'inherit' }}>
                          Use {other === 'sms' ? 'SMS' : 'email'}
                        </button>
                      ) : null
                    })()}
                  </span>
                  {/* Phones: fold the composer back to its one-line bar (the
                      draft is kept) so the thread gets the screen again. */}
                  <button type="button" className="inbox-mobile-only mcmp-collapse" onClick={collapseMobileComposer}
                    title="Collapse reply box" aria-label="Collapse reply box"
                    style={{ display: 'none', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 32, height: 32, borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer', padding: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                </div>
  )
  const renderSendMenu = (forEmail = false, insert?: (t: string) => void) => (
    <>
                  {/* Send poll/survey/form/payment */}
                  <div ref={sendMenuRef} style={{ position: 'relative' }}>
                    <button type="button" className="cmp-tool" onClick={() => { if (!showSendMenu) loadSavedCards(); setShowSendMenu(v => !v) }} title="Send a payment link, form, poll or request media" aria-label="More actions" aria-haspopup="menu" aria-expanded={showSendMenu}
                      style={toolBtn(showSendMenu)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    <Popover open={showSendMenu} onClose={() => setShowSendMenu(false)} anchorRef={sendMenuRef} width={264} prefer="top" label="More actions" role="menu" padding={6} radius={20}>
                      <div className="cmp-send-menu">
                        {([
                          ['Send to the customer', [
                            { key: 'poll', label: 'Send a poll', tint: '#8b5cf6', icon: Icon.poll(), run: () => { pickerInsertRef.current = insert || null; openPicker('poll' as any) } },
                            { key: 'survey', label: 'Send a survey', tint: '#3b82f6', icon: Icon.survey(), run: () => { pickerInsertRef.current = insert || null; openPicker('survey' as any) } },
                            { key: 'form', label: 'Send a form', tint: '#14b8a6', icon: Icon.form(), run: () => { pickerInsertRef.current = insert || null; openPicker('form' as any) } },
                            { key: 'media', label: 'Request photos or video', tint: '#ec4899', icon: Icon.media(16), run: () => { setShowSendMenu(false); setShowMediaRequest(true) } },
                          ]],
                          ['Payments', [
                            { key: 'payment', label: 'Send a payment link', tint: '#10b981', icon: Icon.payment(), run: () => { pickerInsertRef.current = insert || null; openPicker('payment' as any) } },
                            { key: 'charge', label: 'Charge a saved card', tint: 'var(--coral,#ff7a6b)', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>, run: () => { setShowSendMenu(false); setShowChargeCard(true); if (!cardsByConv.current.has(selected?.id || '')) loadSavedCards() } },
                            { key: 'save', label: 'Save a card', tint: '#f59e0b', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><path d="M16 15h3"/></svg>, run: () => { setShowSendMenu(false); saveCard() } },
                          ]],
                          ['More', [
                            { key: 'delivery', label: 'Schedule delivery', tint: '#0ea5e9', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>, run: () => { setShowSendMenu(false); openSchedule() } },
                            ...(!forEmail ? [
                              { key: 'voice', label: 'Record a voice note', tint: '#ef4444', disabled: voiceUploading || recording, icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5"/></svg>, run: () => { setShowSendMenu(false); if (!voiceUploading) startVoiceNote() } },
                              { key: 'phone', label: 'Upload from your phone', tint: '#64748b', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>, run: () => { setShowSendMenu(false); setShowInboxQR(true) } },
                            ] : []),
                          ]],
                        ] as [string, { key: string; label: string; tint: string; icon: React.ReactNode; run: () => void; disabled?: boolean }[]][]).map(([group, rows]) => (
                          <div key={group} className="cmp-plus-group" role="group" aria-label={group}>
                            <p className="cmp-plus-head" aria-hidden>{group}</p>
                            {rows.map(r => (
                              <button key={r.key} type="button" role="menuitem" data-pop-item className="cmp-plus-item" onClick={r.run} disabled={r.disabled}
                                style={{ '--tint': r.tint } as React.CSSProperties}>
                                <span className="cmp-plus-ic" aria-hidden>{r.icon}</span>{r.label}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </Popover>
                  </div>
    </>
  )
  const renderLinkTools = (forEmail = false, insert?: (t: string) => void) => (
    <>
                  {/* Review request — opens a preview; nothing sends until Send is clicked */}
                  <ReviewRequestButton key={`rv-${selected?.id || ''}`} buttonClassName="cmp-tool" buttonStyle={toolBtn()}
                    channel={reviewChannel()} alreadyReviewed={reviewAlready()}
                    getLink={createReviewLink} onSend={sendReviewRequest} onError={showToast}
                    onInsert={t => insert ? insert(t) : setReply(r => (r.trim() ? r.trimEnd() + '\n' : '') + t)} />
                  {/* Shorten a URL straight into the reply */}
                  <div ref={shortenerAnchorRef} style={{ position: 'relative' }}>
                    <button type="button" className="cmp-tool" onClick={() => setShowShortener(v => !v)}
                      title="Create a short, trackable link" aria-label="Create a short link" aria-haspopup="dialog" aria-expanded={showShortener}
                      style={toolBtn(showShortener)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    </button>
                    <Popover open={showShortener} onClose={() => { setShowShortener(false); setShortenError('') }} anchorRef={shortenerAnchorRef} width={340} prefer="top" label="Create a short link" padding={16} radius={22}>
                          <div className="cmp-pop-head">
                          <span className="cmp-pop-badge" aria-hidden>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <b>Create a short link</b>
                            <small>Paste a long URL. It becomes a short link on your own domain that counts clicks.</small>
                          </span>
                        </div>
                        <input value={shortenInput} onChange={e => setShortenInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); shortenIntoReply(insert) } }}
                          placeholder="https://roxyaquarium.com.au/..." data-autofocus aria-label="Long URL" inputMode="url"
                          className="cmp-pop-in" />
                        {shortenError && <p className="cmp-pop-err" role="alert">{shortenError}</p>}
                        <div className="cmp-pop-acts">
                          <button type="button" className="cmp-pop-btn" onClick={() => { setShowShortener(false); setShortenInput(''); setShortenError('') }}>
                            Cancel
                          </button>
                          <button type="button" className="cmp-pop-btn primary" onClick={() => shortenIntoReply(insert)} disabled={shortenBusy || !shortenInput.trim()}>
                            {shortenBusy ? 'Shortening…' : 'Shorten & insert'}
                          </button>
                        </div>
                    </Popover>
                  </div>
                  {!internalMode && <BookingLinkButton iconOnly height={34} companyId={companyId} conversationId={selected?.id || null} contactId={selected?.contact_id || null} onInsert={t => insert ? insert(t) : setReply(r => (r.trim() ? r.trimEnd() + '\n' : '') + t)} />}
    </>
  )

  // Refund a paid order in the shared refund window (the one the Orders board
  // uses): refund everything, or choose items and shipping. It moves real money
  // through the payment gateway, so it always confirms first and states the amount.
  const issueOrderRefund = (payload: any) => {
    if (!companyId) return
    if (!(payload.order_id || payload.id || payload.external_order_id)) { showToast('No order id for this order'); return }
    setRefundOrder({ ...payload, conversation_id: selected?.id || payload.conversation_id || undefined })
  }

  // After a refund: show it on the order straight away (the refetch below
  // confirms it) and leave a team note in the thread.
  const afterOrderRefund = async (payload: any, amt: number, reason: string) => {
    showToast(`Refunded $${amt.toFixed(2)}`)
    const refundedId = String(payload.order_id ?? payload.woo_order_id ?? payload.id)
    setWooOrders(prev => prev.map((o: any) => {
      const oid = o.order_id ?? o.woo_order_id ?? o.id
      if (String(oid) !== refundedId) return o
      const refunded = (Number(o.total_refunded) || 0) + amt
      const full = refunded + 0.005 >= (parseFloat(o.total) || 0)
      return { ...o, total_refunded: refunded, status: full ? 'refunded' : o.status }
    }))
    if (selected) {
      try {
        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_name: myName || 'Colvy', is_internal: true,
          content: `💸 Refunded $${amt.toFixed(2)} on order #${payload.order_number || refundedId}${reason ? ` — ${reason}` : ''}.`,
        })
      } catch {}
      loadWooData(contact?.id || null, contact?.email, contact?.phone)
      loadConversationExtras(selected.id)
    }
  }

  const sendOrderPaymentRequest = async (payload: any) => {
    if (!companyId || !selected) return
    // Reuse the existing in-chat payment request feature, tagged to this order so
    // that when the customer pays, the order is marked processing.
    try {
      const amount = (parseFloat(payload.total) || 0).toFixed(2)
      const res = await authFetch('/api/stripe/chat-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, amount, description: `Order #${payload.order_number}`, senderName: myName, orderId: payload.order_id, integrationId: payload.integration_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not send payment request')
      showToast('Payment request sent')
      refreshThread()
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

  // The order card's action pills (Edit, Issue refund, Invoice…): grey, the text in the action's colour.
  const miniBtn = (color: string): React.CSSProperties => ({ height: 30, fontSize: 12.5, fontWeight: 600, color, background: 'var(--pt-fill, #f4f4f5)', border: 'none', borderRadius: 999, padding: '0 12px', cursor: 'pointer' })

  const folderBtnInbox = (active: boolean): React.CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none', background: active ? 'var(--peach)' : 'transparent', color: active ? 'var(--coral)' : 'var(--ink)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer', marginBottom: 2 }) 

  const openOrderEditor = async (payload: any) => {
    if (!companyId || !payload?.order_id) return
    setEditOrder(payload); setEditOrderData(null); setEditOrderLoading(true)
    try {
      const res = await authFetch(`/api/orders/details?companyId=${companyId}&orderId=${payload.order_id}${payload.integration_id ? `&integrationId=${payload.integration_id}` : ''}`)
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
      const res = await authFetch('/api/orders/edit', {
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
    const shopify = payload.channel === 'shopify' || /^shopify-/.test(String(payload.order_id))
    const verb = status === 'cancelled' ? (payload.draft ? 'delete draft' : 'cancel') : status === 'completed' ? 'mark paid and complete' : 'mark paid'
    if (!await confirmDialog(`Are you sure you want to ${verb} order #${payload.order_number}?${status !== 'cancelled' ? ` This records payment and reduces stock in ${shopify ? 'Shopify' : 'WooCommerce'}.` : ''}`)) return
    try {
      const res = await authFetch('/api/orders/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, orderId: payload.order_id, status, conversationId: selected?.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update order')
      showToast(`Order #${payload.order_number} updated`)
      if (selected) selectConversation(selected)
    } catch (e: any) { showToast(e.message || 'Failed to update order') }
  }

  // One-tap "Request media" — used by the hint card when a customer's MMS
  // couldn't be received. Creates a media request with sensible defaults (photos
  // + videos) and texts the secure upload link, no modal.
  const [quickMrBusy, setQuickMrBusy] = useState(false)
  // Where the upload link will ACTUALLY be delivered — used to stamp the
  // in-thread card so the inbox shows the true channel (SMS/email) instead of
  // always "Live Chat". Mirrors deliverUploadLink's routing: email/Messenger/
  // Instagram keep their channel; anything else with a known mobile (thread
  // sms_number or the contact's phone) goes by SMS; only a widget conversation
  // with no mobile at all is truly chat.
  const uploadChannel = (): string => {
    const ch = activeChannel
    if (ch === 'email' || ch === 'instagram' || ch === 'facebook') return ch
    if (mediaSmsEnabled && smsDestination()) return 'sms'
    return 'chat'
  }

  // Does the inbox text the link itself when the server doesn't? Only for a
  // thread with no number of its own and a mobile to text. Told to the server
  // up front (callerTexts), so the card is labelled SMS only then.
  const inboxTextsUploadLink = () => mediaSmsEnabled && !(selected as any)?.sms_number && !!smsDestination()

  // Deliver a freshly-created upload link to the customer EXACTLY ONCE.
  //
  // The server (/api/media-requests) always posts the in-thread card and, when
  // the thread has an sms_number, also texts the link. So here we only cover
  // what the server did NOT deliver:
  //   • email / Messenger / Instagram — the server never sends these;
  //   • sms/chat/widget with NO thread sms_number but a known mobile — the
  //     server didn't text, so send it ourselves (silent: the card is already
  //     posted, and we don't duplicate it).
  // Crucially, when the thread HAS an sms_number the server already texted, so
  // we send nothing — this is what removes the SMS double-send (server + client)
  // that hit SMS-channel media requests.
  //
  // When nothing went out it says so. It used to answer "sent" whenever the
  // thread had an sms_number, even when the server skipped the text (texting
  // off for the thread) or the provider refused it.
  const deliverUploadLink = async (link: string, body: string, texted = false, smsError: string | null = null, token = ''): Promise<string> => {
    const subject = `${companyInfo?.name || 'We'} need a few files from you`
    const ch = activeChannel
    if (ch === 'email' || ch === 'instagram' || ch === 'facebook') {
      return deliverToCustomer({ subject, body, url: link })
    }
    if (texted) return 'sent'
    // The server tried to text it and couldn't. Another try from here would
    // fail the same way, or text it twice after a timeout.
    if (smsError) throw new Error(smsError)
    // The server also texts the contact's phone when the thread has no
    // sms_number, so only send here when it says it didn't. With the opt-out
    // check automated texts get (checkOptOut); when it doesn't go, the card
    // (labelled SMS up front) is put right and nothing says "sent".
    if (inboxTextsUploadLink()) {
      let failed = ''
      try {
        const res = await authFetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected?.id, to: smsDestination(), text: `${body}\n${link}`, senderName: myName, skipChatMessage: true, checkOptOut: true }),
        })
        if (!res.ok) failed = (await res.json().catch(() => ({})))?.error || `HTTP ${res.status}`
      } catch (e: any) { failed = e?.message || 'Could not reach the SMS service' }
      if (!failed) return 'Sent by SMS'
      if (token && selected) {
        try {
          await (supabase as any).from('messages').update({ delivery_channel: 'chat' })
            .eq('conversation_id', selected.id).eq('message_type', 'media_request').eq('message_payload->>token', token)
        } catch {}
      }
      throw new Error(failed)
    }
    // Not texted. A web chat visitor sees the card in the chat; anyone else
    // hasn't been sent anything.
    if (isWebChat) return 'Posted in the chat'
    const why = !mediaSmsEnabled ? 'texting upload links is switched off'
      : !smsDestination() ? 'no mobile number'
      : 'texting is off for this conversation'
    return `Added to the conversation but not texted (${why})`
  }

  const requestMediaQuick = async () => {
    if (!companyId || !selected || quickMrBusy) return
    setQuickMrBusy(true)
    try {
      const res = await authFetch('/api/media-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected.id, contactId: contact?.id,
          prompt: 'Please upload your photos or videos here.',
          accept: ['image', 'video'], maxFiles: 10, expiryHours: null,
          createdBy: myName,
          deliveryChannel: uploadChannel(),
          callerTexts: !['email', 'instagram', 'facebook'].includes(activeChannel) && inboxTextsUploadLink(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create request')
      let how = 'sent'
      if (data.link) {
        try {
          how = await deliverUploadLink(data.link, 'Please upload your photos or videos here:', !!data.texted, data.smsError || null, data.token || '')
        } catch (e: any) { showToast(`Upload link created, but sending failed: ${e.message}`); refreshThread(); return }
      }
      showToast(`Upload link ${how.toLowerCase()}`)
      refreshThread()
    } catch (e: any) { showToast(e.message || 'Could not send the upload link') }
    finally { setQuickMrBusy(false) }
  }

  const sendMediaRequest = async () => {
    if (!companyId || !selected) return
    if (mrAccept.length === 0) { showToast('Select at least one file type'); return }
    setMrSaving(true)
    try {
      const res = await authFetch('/api/media-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected.id, contactId: contact?.id,
          prompt: mrPrompt.trim() || 'Please upload the requested files.',
          accept: mrAccept, maxFiles: parseInt(mrMaxFiles) || 10,
          expiryHours: mrExpiry ? parseInt(mrExpiry) : null,
          createdBy: myName,
          deliveryChannel: uploadChannel(),
          callerTexts: !['email', 'instagram', 'facebook'].includes(activeChannel) && inboxTextsUploadLink(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create request')
      setShowMediaRequest(false)

      // Deliver the link over the customer's channel — see deliverUploadLink for
      // how it avoids both a missed send (chat with a mobile) and a double send
      // (SMS thread the server already texted).
      let how = 'sent'
      if (data.link) {
        try {
          how = await deliverUploadLink(data.link, `${mrPrompt.trim() || 'Please upload the requested files.'}\nUpload here:`, !!data.texted, data.smsError || null, data.token || '')
        } catch (e: any) { showToast(`Request created, but sending failed: ${e.message}`); setMrSaving(false); return }
      }
      showToast(`Media request ${how.toLowerCase()}`)
      refreshThread()
    } catch (e: any) { showToast(e.message || 'Failed to send request') } finally { setMrSaving(false) }
  }

  const sendCoupon = async () => {
    if (!companyId || !selected || !couponAmount.trim()) return
    setCouponSaving(true)
    try {
      const res = await authFetch('/api/coupons/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected.id, contactId: contact?.id,
          email: contact?.email, amount: couponAmount.trim(),
          discountType: couponType === 'percent' ? 'percent' : 'fixed',
          code: couponCode.trim() || undefined, oneTime: couponOneTime,
          expiryDays: couponExpiry ? Number(couponExpiry) : undefined,
          createdByName: myName, channel: outboundChannel,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create coupon')
      setShowCoupon(false)

      // On a non-widget channel, the in-chat coupon card can't render — send the
      // code and a shop link over whatever channel the customer is on.
      let how = 'sent'
      if (outboundChannel !== 'widget' && outboundChannel !== 'chat') {
        const shop = (companyInfo as any)?.store_url || ''
        const amount = couponType === 'percent' ? `${couponAmount.trim()}%` : `$${couponAmount.trim()}`
        try {
          how = await deliverToCustomer({
            subject: `A ${amount} coupon from ${companyInfo?.name || 'us'}`,
            body: `Here's ${amount} off your next order — use code ${data.code} at checkout.${couponExpiry ? ` Valid for ${couponExpiry} days.` : ''}`,
            url: shop || null,
            checkOptOut: true,
          })
        } catch (e: any) { showToast(`Coupon created, but sending failed: ${e.message}`); setCouponSaving(false); return }
      }
      showToast(`Coupon ${data.code} ${how.toLowerCase()}`)
      refreshThread()
    } catch (e: any) { showToast(e.message || 'Failed to send coupon') } finally { setCouponSaving(false) }
  }

  // ── Proof of Delivery ─────────────────────────────────────────────────────
  // Attach the delivery photo(s) + a note, send it to the customer in the chat
  // (and by SMS if we have their mobile), and mark the delivery as delivered.
  const sendProofOfDelivery = async () => {
    if (!selected || !companyId) return
    if (podFiles.length === 0 && !podNote.trim()) { showToast('Add a photo or a note first'); return }
    setPodSending(true)
    try {
      // Uploads go straight to storage from the browser. Routing them through
      // a serverless function capped the body at ~4.5MB, which a phone photo
      // exceeds — and the 413 came back as plain text, so parsing it as JSON
      // produced "Unexpected token 'R'" instead of anything about file size.
      const attachments: any[] = []
      for (const file of podFiles) {
        try {
          const up = await uploadAttachment(file, {
            companyId, conversationId: selected.id,
          })
          attachments.push({ url: up.url, name: up.name, type: up.type, kind: up.kind })
        } catch (e: any) {
          showToast(`Could not upload ${file.name}: ${e.message}`)
        }
      }
      if (podFiles.length > 0 && attachments.length === 0) {
        setPodSending(false)
        return
      }

      const me = myName
      const note = podNote.trim() || 'Your order has been delivered. Attached is the proof of delivery — thank you!'

      // Build ONE branded gallery link for the whole set — the friendly
      // /m/<code> page (logo, media, download button, "Shared securely via
      // Colvy"). The previous path fell back to raw Supabase storage URLs when
      // the link insert failed, which is why the customer saw an ugly link AND
      // a duplicate image.
      let galleryUrl = ''
      if (attachments.length > 0) {
        try {
          const res = await authFetch('/api/short-links/create', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, kind: 'media',
              url: attachments[0].url,
              mediaUrls: attachments,
              note,
              label: attachments.length > 1 ? `${attachments.length} photos` : 'Delivery photo',
              conversationId: selected.id,
              sentBy: me,
            }),
          })
          const d = await readJsonSafe(res)
          if (res.ok && d.url) galleryUrl = d.url
          else console.warn('[POD] gallery link failed:', d.error)
        } catch (e) { console.warn('[POD] gallery link error:', e) }
      }

      // Chat message: note + branded link only (never raw storage URLs). The
      // attachments still ride along so they render in the agent's thread.
      const body = galleryUrl ? `${note}\n\n${galleryUrl}` : note
      const smsNumber = smsDestination()

      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_name: me, content: body, attachments,
        metadata: { proof_of_delivery: true },
        delivery_channel: smsNumber ? 'sms' : 'chat',
      })
      await (supabase as any).from('conversations').update({
        last_message: 'Proof of delivery sent', last_message_at: new Date().toISOString(),
      }).eq('id', selected.id)

      // Text it too, when we have a mobile. If we already built the gallery
      // link, send note + that link with NO attachments (so the SMS route
      // doesn't append a second link). Otherwise let the route build the link.
      if (smsNumber) {
        try {
          await authFetch('/api/telnyx/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: selected.id, to: smsNumber,
              text: galleryUrl ? body : note,
              attachments: galleryUrl ? [] : attachments,
              senderName: me, skipChatMessage: true,
            }),
          })
        } catch {}
      }

      // Mark the delivery done on the contact.
      if (contact?.id) {
        await (supabase as any).from('contacts').update({
          delivery_status: 'delivered',
        }).eq('id', contact.id)
        setContact((c: any) => ({ ...c, delivery_status: 'delivered' }))
      }

      setShowPod(false); setPodFiles([]); setPodNote('')
      showToast('Proof of delivery sent')
    } catch (e: any) {
      showToast(e.message || 'Could not send proof of delivery')
    } finally { setPodSending(false) }
  }

  const openTicket = () => {
    // A draft for this conversation is kept; otherwise start from its subject.
    if (!ticketSubject.trim() && !ticketDesc.trim()) { setTicketSubject(dec(selected?.subject || '')); setTicketPriority('normal') }
    setTicketMode(true); setMComposerOpen(true)
  }
  const discardTicket = () => { setTicketMode(false); setTicketSubject(''); setTicketDesc(''); setTicketPriority('normal') }
  // A ticket draft belongs to the conversation it was started in.
  useEffect(() => { setTicketMode(false); setTicketSubject(''); setTicketDesc('') }, [selected?.id])

  const createTicket = async () => {
    if (!companyId || !ticketSubject.trim()) return
    setTicketSaving(true)
    try {
      const res = await authFetch('/api/tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, conversationId: selected?.id, contactId: contact?.id,
          subject: ticketSubject.trim(), description: ticketDesc.trim(), priority: ticketPriority,
          createdBy: user?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create ticket')
      setTicketMode(false); setTicketSubject(''); setTicketDesc('')
      showToast(`Ticket ${data.ticket?.ticket_number} created`)
      if (selected) selectConversation(selected)
    } catch (e: any) {
      showToast(e.message || 'Failed to create ticket')
    } finally { setTicketSaving(false) }
  }

  // A poll, survey or form for the customer. Nothing goes out on the click:
  //   live chat → the interactive card, after a confirm;
  //   SMS / email / Messenger → a short link to its own page, put into the
  //   reply for a person to check, edit and send.
  const sendInteractive = async (kind: 'poll' | 'survey' | 'form', item: any) => {
    if (!selected || !companyId) return
    const senderName = myName
    const title = item.question || item.title || item.name || `${kind}`
    const via = composeChannel()
    const isWidgetActive = via === 'widget' || via === 'chat'

    if (isWidgetActive) {
      if (!await confirmDialog({ title: `Send this ${kind}?`, message: `“${title}” appears in the live chat for the customer to answer.`, confirmLabel: 'Send', tone: 'primary' })) return
      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_id: user.id, sender_name: senderName,
        content: `📋 ${title}`,
        message_type: kind,
        message_payload: { kind, ref_id: item.id, title, options: item.options || null },
        delivery_channel: 'chat',
      })
      await (supabase as any).from('conversations').update({ last_message: `📋 ${title}`, last_message_at: new Date().toISOString() }).eq('id', selected.id)
      setSendPicker(null)
      if (await reloadThread(selected.id)) scrollBottom()
      return
    }

    // The public page (company.colvy.com/polls/…, /surveys/…, /forms/…),
    // behind a short tracked link so clicks show on the conversation.
    const path = kind === 'poll' ? 'polls' : kind === 'survey' ? 'surveys' : 'forms'
    const target = `${typeof window !== 'undefined' ? window.location.origin : ''}/${path}/${item.id}`
    let link = target
    try {
      const res = await authFetch('/api/short-links/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, kind: 'redirect', url: target, label: title, conversationId: selected.id, sentBy: senderName || null, channel: via === 'email' ? 'email' : 'sms' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.url) link = d.url
    } catch { /* the full link still works */ }
    const text = `${title}\n${kind === 'form' ? 'Fill it in here' : 'Tap to answer'}: ${link}`
    const insert = pickerInsertRef.current
    if (insert) insert(text)
    else setReply(r => (r.trim() ? r.trimEnd() + '\n\n' : '') + text)
    pickerInsertRef.current = null
    setSendPicker(null)
    showToast('Added to your reply. Check it, then press Send.')
  }

  // Send a payment request into the chat. Locked while it's in flight, so a
  // double click can't create and text two payment links.
  const [paySending, setPaySending] = useState(false)
  const paySendingRef = useRef(false)
  const sendPayment = async () => {
    if (!selected || !companyId || !payAmount || paySendingRef.current) return
    paySendingRef.current = true; setPaySending(true)
    const senderName = myName
    try {
      const via = composeChannel()
      const isWidgetActive = via === 'widget' || via === 'chat'
      // SMS / email / Messenger: a draft payment, its short link put into the
      // reply for a person to check and send (nothing goes out from here).
      // Live chat: the payment card, sent from this form.
      const res = await authFetch('/api/stripe/chat-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, amount: payAmount, description: payDesc, senderName, channel: isWidgetActive ? 'chat' : via, draft: !isWidgetActive, ...(payAddress ? { collectAddress: payAddress } : {}) }),
      })
      const data = await res.json()
      if (!res.ok) { alertDialog(data.error || 'Could not create payment'); return }
      if (!isWidgetActive) {
        if (!data.checkoutUrl) { alertDialog('Could not make the payment link'); return }
        const text = `Payment request: $${parseFloat(payAmount).toFixed(2)} AUD${payDesc ? ` — ${payDesc}` : ''}\nPay securely: ${data.checkoutUrl}`
        const insert = pickerInsertRef.current
        if (insert) insert(text)
        else setReply(r => (r.trim() ? r.trimEnd() + '\n\n' : '') + text)
        pickerInsertRef.current = null
        showToast('Payment link added to your reply. Check it, then press Send.')
      }
      setSendPicker(null); setPayAmount(''); setPayDesc(''); setPayAddress(null)
      if (isWidgetActive && await reloadThread(selected.id)) scrollBottom()
    } catch (e: any) { alertDialog('Payment error: ' + e.message) }
    finally { paySendingRef.current = false; setPaySending(false) }
  }

  // Send the composer text. Channel is auto-routed unless the agent forces one
  // from the Send dropdown.
  const [sendChannel, setSendChannel] = useState<'auto' | 'chat' | 'sms' | 'email'>('auto')
  const [showChannelMenu, setShowChannelMenu] = useState(false)
  // A channel picked for one conversation must not carry over to the next
  // (it stayed set, so a later email thread could open on SMS). A deep link's
  // ?channel= is applied to the conversation it opened.
  useEffect(() => {
    const want = pendingSendChannelRef.current
    pendingSendChannelRef.current = null
    setSendChannel(want === 'sms' || want === 'email' || want === 'chat' ? want : 'auto')
    // Phones open each thread reading, composer collapsed — unless a deep link
    // ("Message" / "Email" from Contacts) came here to write.
    setMComposerOpen(!!want)
    setMToolsOpen(false)
    setEmailDraftText('')
  }, [selected?.id])
  // THE switch between the email composer and the chat / SMS box. Anything
  // that needs to know "is this reply an email?" (the composer, review links,
  // inserts) reads this one boolean.
  const showEmailComposer = sendChannel === 'email' || (activeChannel === 'email' && sendChannel === 'auto')
  // Phones: open the collapsed reply bar into the full composer (Reply or Note),
  // put the caret in it, and keep the newest message in view above it.
  const openMobileComposer = (note?: boolean) => {
    if (note !== undefined) setInternalMode(note)
    setMComposerOpen(true)
    setTimeout(() => {
      const box = document.querySelector<HTMLElement>('.inbox-composer .email-rte, .inbox-composer textarea.cmp-input')
      try { box?.focus({ preventScroll: true }) } catch { box?.focus() }
      scrollBottom()
    }, 60)
  }
  const collapseMobileComposer = () => {
    setMComposerOpen(false)
    const a = document.activeElement as HTMLElement | null
    if (a && a.closest('.inbox-composer')) a.blur()
  }
  // The customer hasn't written here and the shared rule hasn't answered yet:
  // show a neutral placeholder rather than one composer that flips to the other.
  const channelResolving = !customerSpoke && sendChannel === 'auto' && !!selected?.id && channelPick?.convId !== selected?.id

  // Right-click context menu on the conversation list.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: any } | null>(null)

  // ── Pinned conversations (per user) ───────────────────────────────────────
  // Each agent keeps their own pins, so pinning floats a chat to the top of
  // *their* inbox without touching anyone else's list.
  const [pinUserId, setPinUserId] = useState<string>('')
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set())
  useEffect(() => { (async () => { try { const { data: { user } } = await supabase.auth.getUser(); if (user?.id) setPinUserId(user.id) } catch {} })() }, [])
  // Read this user's pins from the DB — the source of truth that keeps web and
  // mobile in step. Read by user_id only (matching the realtime filter and the
  // mobile app), so a pin whose company_id was written slightly differently by
  // another client still shows.
  const loadPins = useCallback(async () => {
    if (!pinUserId) return
    try {
      const { data } = await (supabase as any).from('conversation_pins')
        .select('conversation_id').eq('user_id', pinUserId)
      setPinnedIds(new Set((data || []).map((r: any) => r.conversation_id)))
    } catch { /* table may not be migrated yet */ }
  }, [pinUserId])
  useEffect(() => {
    if (!pinUserId || !companyId) return
    loadPins()
    // Live-sync pins across devices/tabs — a pin made on the mobile app (or
    // another browser) shows here without a reload, as long as it reached the
    // conversation_pins table.
    let ch: any = null
    try {
      ch = (supabase as any)
        .channel(`conversation_pins-${pinUserId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_pins', filter: `user_id=eq.${pinUserId}` }, () => loadPins())
        .subscribe()
    } catch {}
    return () => { if (ch) { try { (supabase as any).removeChannel(ch) } catch {} } }
  }, [pinUserId, companyId, loadPins])
  // Realtime alone isn't reliable: after the laptop sleeps or the tab is
  // backgrounded the socket drops and missed pin/unpin events never replay, so
  // the list drifts out of step with mobile. Re-read from the DB whenever the
  // tab regains focus/visibility (mirrors the mobile app's focus refetch), so
  // returning to the web inbox always reconciles to the true pin state.
  useEffect(() => {
    if (!pinUserId) return
    const resync = () => { if (document.visibilityState !== 'hidden') loadPins() }
    window.addEventListener('focus', resync)
    document.addEventListener('visibilitychange', resync)
    return () => { window.removeEventListener('focus', resync); document.removeEventListener('visibilitychange', resync) }
  }, [pinUserId, loadPins])
  const togglePin = async (conv: any) => {
    const id = conv?.id
    if (!id || !pinUserId || !companyId) return
    const wasPinned = pinnedIds.has(id)
    setPinnedIds(prev => { const n = new Set(prev); wasPinned ? n.delete(id) : n.add(id); return n })
    try {
      if (wasPinned) await (supabase as any).from('conversation_pins').delete().eq('user_id', pinUserId).eq('conversation_id', id)
      else await (supabase as any).from('conversation_pins').insert({ user_id: pinUserId, conversation_id: id, company_id: companyId })
    } catch (e) {
      // Revert the optimistic change if the write failed.
      setPinnedIds(prev => { const n = new Set(prev); wasPinned ? n.add(id) : n.delete(id); return n })
    }
  }
  // A pinned conversation must stay visible even when it's no longer in the
  // recent page the inbox loads (otherwise it vanishes on reload). Fetch the
  // pinned rows by id and merge them into the list below.
  const [pinnedExtraConvs, setPinnedExtraConvs] = useState<any[]>([])
  useEffect(() => {
    if (!companyId || pinnedIds.size === 0) { setPinnedExtraConvs([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const ids = Array.from(pinnedIds)
        const rows: any[] = []
        for (let i = 0; i < ids.length; i += 100) {
          const { data } = await (supabase as any).from('conversations')
            .select('*').eq('company_id', companyId).in('id', ids.slice(i, i + 100))
          rows.push(...(data || []))
        }
        const cids = Array.from(new Set(rows.map((r: any) => r.contact_id).filter(Boolean)))
        if (cids.length) {
          const byId = await contactsByIds(cids as string[])
          for (const r of rows) (r as any).contacts = r.contact_id ? byId[r.contact_id] || null : null
        }
        await linkPhoneThreads(companyId, rows)
        if (!cancelled) setPinnedExtraConvs(rows)
      } catch { if (!cancelled) setPinnedExtraConvs([]) }
    })()
    return () => { cancelled = true }
  }, [pinnedIds, companyId])

  // ── Move or view enquiries across outlets ─────────────────────────────────
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  // Close dropdowns when clicking anywhere else (or pressing Escape). Menus that
  // only close by re-clicking the same button are quietly infuriating.
  const sendMenuRef = useRef<HTMLDivElement>(null)
  const channelMenuRef = useRef<HTMLDivElement>(null)
  const moveMenuRef = useRef<HTMLDivElement>(null)
  const quickMenuRef = useRef<HTMLDivElement>(null)
  // (The + menu closes itself: it's a shared composer Popover.) The older
  // menus join its one-open-at-a-time rule.
  useOneOpen(showChannelMenu, () => setShowChannelMenu(false))
  useOneOpen(showMoveMenu, () => setShowMoveMenu(false))
  useOneOpen(showQuickMenu, () => setShowQuickMenu(false))
  useOneOpen(mentionQuery !== null, () => setMentionQuery(null))
  useClickOutside(showChannelMenu, () => setShowChannelMenu(false), [channelMenuRef])
  useClickOutside(showMoveMenu, () => setShowMoveMenu(false), [moveMenuRef])
  useClickOutside(showQuickMenu, () => setShowQuickMenu(false), [quickMenuRef])
  const [outlets, setOutlets] = useState<any[]>([])
  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('company_locations')
        .select('id, label, suburb, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false })
      setOutlets(data || [])
    })()
  }, [companyId])

  const moveToOutlet = async (outlet: any) => {
    if (!selected) return
    await (supabase as any).from('conversations')
      .update({ assigned_location_id: outlet.id, assigned_auto: false }).eq('id', selected.id)
    // Keep the contact's location in sync so the Contacts page location filter
    // reflects the move.
    if ((selected as any).contact_id) {
      await (supabase as any).from('contacts').update({ location_id: outlet.id }).eq('id', (selected as any).contact_id)
    }
    await (supabase as any).from('conversation_events').insert({
      conversation_id: selected.id, company_id: companyId,
      event_type: 'moved', actor_name: myName,
      detail: `Enquiry moved to ${outlet.label || outlet.suburb}`,
    })
    setShowMoveMenu(false)
    setSelected({ ...selected, assigned_location_id: outlet.id } as any)
    loadConversationExtras(selected.id)
    showToast(`Moved to ${outlet.label || outlet.suburb}`)
  }
  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close, true) }
  }, [ctxMenu])

  const markRead = async (conv: any) => {
    // Toggle: an already-read conversation is marked unread again (with a badge
    // count of at least 1 so it reads as freshly unread), otherwise mark read.
    const makeUnread = !conv.is_unread
    await (supabase as any).from('conversations').update(
      makeUnread
        ? { is_unread: true, unread_count: Math.max(1, conv.unread_count || 0) }
        : { is_unread: false, unread_count: 0 }
    ).eq('id', conv.id)
    loadConversations()
  }
  const snoozeConv = async (conv: any, hours: number) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString()
    await (supabase as any).from('conversations').update({ snoozed_until: until }).eq('id', conv.id)
    loadConversations()
    showToast(`Snoozed for ${hours}h`)
  }
  const closeConv = async (conv: any) => {
    const wasClosed = ['closed', 'resolved'].includes(String(conv.status || ''))
    await (supabase as any).from('conversations').update({ status: 'closed' }).eq('id', conv.id)
    if (!wasClosed && companyId) {
      const actorName = myName
      await (supabase as any).from('conversation_events').insert({
        conversation_id: conv.id, company_id: companyId, event_type: 'closed', actor_name: actorName, detail: 'Enquiry closed.',
      })
      if (selected?.id === conv.id) loadConversationExtras(conv.id)
    }
    loadConversations()
    showToast('Enquiry closed')
  }
  const reopenConv = async (conv: any) => {
    const wasClosed = ['closed', 'resolved'].includes(String(conv.status || ''))
    await (supabase as any).from('conversations').update({ status: 'open' }).eq('id', conv.id)
    if (wasClosed && companyId) {
      const actorName = myName
      await (supabase as any).from('conversation_events').insert({
        conversation_id: conv.id, company_id: companyId, event_type: 'reopened', actor_name: actorName, detail: 'Enquiry reopened.',
      })
      if (selected?.id === conv.id) loadConversationExtras(conv.id)
    }
    loadConversations()
    showToast('Enquiry reopened')
  }
  const copyConvLink = (conv: any) => {
    const url = `${window.location.origin}/admin/inbox?conversation=${conv.id}`
    navigator.clipboard?.writeText(url)
    showToast('Link copied')
  }

  // ── Claim on first reply ───────────────────────────────────────────────────
  // Whoever answers an unassigned conversation owns it. That is what replying
  // already means in practice, and leaving it unassigned lets two agents pick
  // up the same customer without realising.
  //
  // Never overwrites an existing owner, and the update is guarded on
  // assigned_to being null so a colleague who claimed it a moment earlier keeps
  // it rather than having it taken from under them.
  const claimIfUnassigned = async () => {
    if (!selected || !user) return
    if (selected.assigned_to || (selected as any).assigned_name) return

    const me = myName || 'Agent'

    setSelected(s => s ? ({ ...s, assigned_to: user.id, assigned_name: me, status: 'assigned' } as any) : s)

    const { data, error } = await (supabase as any)
      .from('conversations')
      .update({ assigned_to: user.id, assigned_name: me, status: 'assigned' })
      .eq('id', selected.id)
      .is('assigned_to', null)
      .select()

    if (error || !data || data.length === 0) {
      // Either it failed or someone else got there first — take their version.
      loadConversations()
      return
    }

    // The database gives a conversation without an outlet its assignee's home
    // outlet (COLVY_V349); pick that up straight away.
    const row = data[0]
    if (row?.assigned_location_id) setSelected(s => s && s.id === row.id ? ({ ...s, assigned_location_id: row.assigned_location_id, assigned_auto: row.assigned_auto } as any) : s)
    logEvent('assigned', `Auto-assigned to ${me} on first reply`)
    showToast(`Assigned to you`)
    loadConversations()
  }

  // What Colvy Voice put in the reply box since it was last empty, to tag the
  // reply "Voice typed" / "Voice assisted" (lib/voice-typed).
  const dictatedRef = useRef<string[]>([])
  useEffect(() => { if (!reply) dictatedRef.current = [] }, [reply])
  const sendReply = async () => {
    if ((!reply.trim() && stagedMedia.length === 0) || !selected || !user) return
    setSending(true)
    let content = reply.trim()
    const senderName = myName
    const voice = voiceKind(content, dictatedRef.current)
    const voiceSince = new Date(Date.now() - 5000).toISOString()
    // A send takes a few seconds and the agent may open another chat meanwhile.
    // When it finishes, forget THIS conversation's draft, but only reset the
    // composer if this conversation is still open — otherwise it belongs to the
    // chat they moved to (and whatever they've started typing there).
    const sentFrom = selected.id
    const sendDone = () => {
      draft.discard()
      if (voice) tagVoice(sentFrom, voiceSince, voice).then(() => { if (selectedIdRef.current === sentFrom) reloadThread(sentFrom) })
      // A payment link went out in this reply: that message becomes the
      // payment's card, which turns PAID when the money arrives (lib/payment-links).
      if (!internalMode && companyId && /\/(?:l|pay)\/[A-Za-z0-9_-]+/.test(content)) {
        authFetch('/api/stripe/chat-payment/attach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, conversationId: sentFrom }) })
          .then(r => r.json()).then(d => { if (d?.linked && selectedIdRef.current === sentFrom) reloadThread(sentFrom) }).catch(() => {})
      }
      if (selectedIdRef.current !== sentFrom) return
      setReply(''); setReplyTo(null); setSending(false)
    }

    // An internal note isn't taking the customer on, so it doesn't claim the
    // conversation — only a customer-facing reply does.
    if (!internalMode) claimIfUnassigned()

    // A team member replying into a CLOSED/resolved enquiry reopens it — record
    // that on the timeline so the reopen is visible the same way a customer's
    // reopen is. Customer-facing replies only; an internal note doesn't reopen.
    if (!internalMode && ['closed', 'resolved'].includes(String((selected as any).status || ''))) {
      const who = senderName || 'A team member'
      try { await (supabase as any).from('conversations').update({ status: 'open' }).eq('id', selected.id) } catch {}
      setSelected(s => s && s.id === sentFrom ? ({ ...s, status: 'open' } as any) : s)
      logEvent('reopened', `Reopened when ${who} replied.`)
    }

    // Deliver any attached-but-unsent gallery media first (internal notes never
    // carry customer-facing media). If there's no accompanying text, we're done.
    if (!internalMode && stagedMedia.length > 0) {
      // Gallery-picked items deliver per-item (SMS + chat, per-item expiry);
      // uploaded files deliver as a batch through the richer path (SMS/Meta/
      // email, one gallery link). Split them and handle each.
      const galleryItems = stagedMedia.filter((m: any) => !m._upload)
      const uploadItems = stagedMedia.filter((m: any) => m._upload)
      const galleryToSend = galleryItems.map((it: any) => ({
        ...it,
        _expiresAt: it._fromGallery ? null : resolveExpiry(stagedExpiry[it.id]),
        _expiryMode: expiryDeleteMode ? 'delete' : 'access',
      }))
      // The uploaded batch shares one link, so use the earliest chosen expiry.
      const upExpiry = uploadItems
        .map((m: any) => resolveExpiry(stagedExpiry[m.id]))
        .filter(Boolean)
        .sort()[0] || null
      setStagedMedia([]); setStagedExpiry({}); setExpiryDeleteMode(false)
      if (galleryToSend.length) await deliverMedia(galleryToSend)
      if (uploadItems.length) {
        await deliverUploadedAttachments(uploadItems.map((u: any) => u._attachment), {
          convId: selected.id, smsNumber: smsDestination(), metaCh: activeChannel, me: senderName,
          expiresAt: upExpiry, expiryMode: expiryDeleteMode ? 'delete' : 'access',
        })
      }
      if (!content) { setSending(false); return }
    }

    // ── Internal staff-only note ────────────────────────────────────────────
    // Written straight to the messages table with is_internal = true and never
    // handed to ANY delivery channel (SMS / chat / email / Meta), so the
    // customer can't receive it. It still appears inline in the thread so the
    // team reads it in sequence with the real conversation.
    if (internalMode) {
      try {
        // Combine what was picked from the dropdown with anything typed by
        // hand, then keep only handles still present in the final text.
        const typed = resolveMentions(content)
        const picked = mentionedUsers
          .filter((m: any) => {
            const compact = String(m.name || '').replace(/\s+/g, '').toLowerCase()
            const first = String(m.name || '').split(/\s+/)[0]?.toLowerCase() || ''
            const low = content.toLowerCase()
            return low.includes(`@${compact}`) || low.includes(`@${first}`)
          })
          .map((m: any) => m.user_id)
        const mentionedIds = Array.from(new Set([...typed, ...picked].filter(Boolean))) as string[]
        // A voice note (or any staged media) rides along with the note, staying
        // internal — never handed to a delivery channel.
        const noteAttachments = stagedMedia.map(stagedToAttachment)
        setStagedMedia([]); setStagedExpiry({}); setExpiryDeleteMode(false)
        const { data: inserted } = await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_name: senderName, content, is_internal: true,
          mentions: mentionedIds,
          ...(noteAttachments.length ? { attachments: noteAttachments } : {}),
        }).select().maybeSingle()

        // Notify anyone @mentioned in the note.
        if (mentionedIds.length) {
          await (supabase as any).from('mention_notifications').insert(
            mentionedIds.map((uid: string) => ({
              company_id: companyId, conversation_id: selected.id,
              message_id: inserted?.id || null, mentioned_user: uid,
              mentioned_by: senderName, preview: content.slice(0, 140),
            }))
          )
          // Also email them. Fire-and-forget: the in-app notification is already
          // saved, so a mail problem must not block the note being posted.
          authFetch('/api/mentions/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: selected.id, userIds: mentionedIds,
              mentionedBy: senderName, preview: content.slice(0, 300),
              context: `a conversation with ${contact?.name || selected.subject || 'a customer'}`,
            }),
          }).catch(() => {})
        }
        // Deliberately NOT touching conversations.last_message — an internal
        // note shouldn't change what the conversation list shows the customer
        // said, and shouldn't mark the thread as newly active for them.
        sendDone()
        if (selectedIdRef.current === sentFrom) { setInternalMode(false); setMentionedUsers([]) }
        await reloadThread(selected.id)
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        alertDialog('Could not save the internal note: ' + e.message)
      }
      return
    }

    // Every link a customer gets from Colvy is a tracked short link (opens,
    // device, city) — whatever channel this goes out on.
    if (/https?:\/\//i.test(content)) {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const t = sess?.session?.access_token
        const r = await fetch('/api/links/track', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
          body: JSON.stringify({ companyId, conversationId: selected.id, text: content, channel: (selected as any).channel || sendChannel || 'chat', sentBy: senderName }),
        })
        const d = await r.json().catch(() => ({}))
        if (r.ok && typeof d.text === 'string' && d.text) content = d.text
      } catch { /* send the original if tracking fails */ }
    }

    // Someone writing from their Colvy chat (lib/colvy-chat, Colvy's own
    // inbox only): the answer goes back into that chat in the app, never by
    // email or text, whatever the contact has on file. Text only there.
    if (String((selected as any).channel || '') === 'colvy') {
      if (stagedMedia.length) { setSending(false); alertDialog('Files can’t be sent in the Colvy chat yet. Paste a link instead.'); return }
      await deliverChat(content, senderName)
      return
    }

    // Instagram / Messenger conversations reply through the Meta Send API.
    if ((selected as any).channel === 'instagram' || (selected as any).channel === 'facebook') {
      try {
        const res = await authFetch('/api/meta/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Message failed to send')
        sendDone()
        await reloadThread(selected.id)
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        alertDialog('Could not send: ' + e.message)
      }
      return
    }

    // WhatsApp conversations reply on WhatsApp (Colvy's Twilio WhatsApp
    // sender), unless the agent picked another channel from Send. Inside the
    // 24-hour window only: after it the server refuses, and the bar above the
    // composer offers an approved template.
    if (sendChannel === 'auto' && (activeChannel === 'whatsapp' || (selected as any).channel === 'whatsapp')) {
      try {
        const res = await authFetch('/api/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'WhatsApp message failed to send')
        sendDone()
        await reloadThread(selected.id)
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        showToast(`${String(e?.message || 'WhatsApp message failed to send').replace(/[.\s]+$/, '')}. Your message wasn’t sent.`)
      }
      return
    }

    // Email conversations reply by email (threaded back into the customer's
    // original message), not through the chat widget.
    if ((selected as any).channel === 'email' || sendChannel === 'email') {
      try {
        const res = await authFetch('/api/email/reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Email failed to send')
        sendDone()
        await reloadThread(selected.id)
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        alertDialog('Could not send the email: ' + e.message)
      }
      return
    }

    // Auto-route. Two rules, in order:
    //   1. Continue the conversation on whatever channel we last used, so a
    //      thread that moved to SMS stays on SMS instead of silently flipping
    //      back to the widget.
    //   2. Never drop a reply into a live chat the visitor doesn't have open —
    //      if the widget isn't currently active, deliver over SMS so they
    //      actually receive it.
    const smsNumber = smsDestination()
    // "Is the customer still on live chat?" Prefer the live chat WHILE they're
    // actually there; only fall back to SMS (then email) once they've left. Two
    // signals, either is enough:
    //   • the widget heartbeat (page_seen_at < 2 min), and
    //   • a very recent inbound message that arrived over the chat/widget channel
    //     (a strong "they're typing here right now" signal even if a heartbeat
    //     was missed).
    // If their most recent inbound came in by SMS instead, they're on SMS, so we
    // continue there. This stops replies going out by SMS while the customer is
    // sitting in the widget.
    const lastIn = [...messages].reverse().find((m: any) => m.sender_type !== 'agent' && m.sender_type !== 'system')
    const lastInCh = String((lastIn as any)?.delivery_channel || '').toLowerCase()
    const lastInAt = (lastIn as any)?.created_at ? parseTs((lastIn as any).created_at) : null
    const lastInRecent = !!lastInAt && (Date.now() - lastInAt.getTime()) < 180000
    // An EXPLICIT chat/widget channel only — an empty channel is NOT proof the
    // customer is on a widget (calls, imports and untagged rows have no channel),
    // and treating '' as live-chat was routing SMS replies into a widget that
    // doesn't exist on most accounts. Also require that this conversation has a
    // widget heartbeat history at all (page_seen_at ever set) before trusting the
    // "recently active in chat" fallback.
    const lastInIsChat = ['chat', 'widget', 'live_chat'].includes(lastInCh)
    const hasWidgetHistory = !!(selected as any)?.page_seen_at
    const visitorOnLiveChat = isOnPageNow || (hasWidgetHistory && lastInRecent && lastInIsChat)

    // A website chat visitor who didn't tick "Continue this conversation by
    // text" isn't texted automatically (lib/channel-choice); choosing SMS
    // in the composer still can.
    const noSmsOptIn = channelPick?.convId === selected.id && channelPick.smsOptIn === false
    const shouldSms = sendChannel === 'sms'
      ? !!smsNumber
      : sendChannel === 'chat'
        ? false
        // Auto: SMS only when the customer is NOT currently on live chat.
        : (!!smsNumber && !visitorOnLiveChat && !noSmsOptIn)

    // If we can't use SMS and the visitor isn't on live chat, fall back to email
    // rather than dropping the reply into a chat nobody is watching.
    // Order of preference: live chat (if they're on it) → SMS → email → chat.
    const emailTo = contact?.email || (selected as any).customer_email || null
    const shouldEmail = sendChannel === 'auto'
      && !shouldSms
      && !visitorOnLiveChat
      && !!emailTo

    if (shouldEmail) {
      // Same guard as SMS: only announce a switch when the thread is genuinely
      // moving to email, judged from the real current channel — not the possibly
      // -null active_channel column (which made a different agent's reply on an
      // already-email thread log a bogus "Now replying by email").
      const wasEmail = activeChannel === 'email'
        || (selected as any).active_channel === 'email'
        || String((selected as any).channel || '').toLowerCase() === 'email'
      try {
        if (!wasEmail) {
          await (supabase as any).from('conversations').update({ active_channel: 'email' }).eq('id', selected.id)
          await (supabase as any).from('conversation_events').insert({
            conversation_id: selected.id, company_id: companyId,
            event_type: 'channel_switch', actor_name: senderName,
            detail: 'Now replying by email',
          })
        } else if ((selected as any).active_channel !== 'email') {
          await (supabase as any).from('conversations').update({ active_channel: 'email' }).eq('id', selected.id)
        }
        const res = await authFetch('/api/email/reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName, to: emailTo }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Email failed to send')
        sendDone()
        await reloadThread(selected.id)
        scrollBottom()
      } catch (e: any) {
        // Don't silently record a "Live Chat" the customer can't see — surface
        // why the email didn't go out and keep the reply for a retry.
        console.warn('Email send failed:', e?.message)
        setSending(false)
        const emsg = String(e?.message || 'Email failed to send')
        const emsgClean = emsg.replace(/[.\s]+$/, '')
        if (/not configured|no .*mailbox|not connected|gmail/i.test(emsg)) {
          showToast('Email isn’t connected for this workspace yet — connect a mailbox under Integrations. Your message wasn’t sent.')
        } else {
          showToast(`Couldn’t send email: ${emsgClean}. Your message wasn’t sent.`)
        }
      }
      return
    }

    if (shouldSms) {
      // Only announce a channel switch when the conversation is GENUINELY moving
      // to SMS. Use the real current channel (from the message history), not just
      // the active_channel column — that can be null on an already-SMS thread, so
      // relying on it made a different agent's reply log a bogus "Now chatting
      // through SMS" on a thread that was SMS all along.
      const wasSms = activeChannel === 'sms'
        || (selected as any).active_channel === 'sms'
        || String((selected as any).channel || '').toLowerCase() === 'sms'
      if (!wasSms) {
        try {
          await (supabase as any).from('conversations').update({ active_channel: 'sms' }).eq('id', selected.id)
          await (supabase as any).from('conversation_events').insert({
            conversation_id: selected.id, company_id: companyId,
            event_type: 'channel_switch', actor_name: senderName,
            detail: 'Now chatting through SMS',
          })
        } catch {}
      } else if ((selected as any).active_channel !== 'sms') {
        // Keep the column in step without announcing anything.
        try { await (supabase as any).from('conversations').update({ active_channel: 'sms' }).eq('id', selected.id) } catch {}
      }
      try {
        const res = await authFetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: content, senderName }),
        })
        const data = await res.json()
        if (!res.ok) { const err: any = new Error(data.error || 'SMS failed'); err.reason = data.reason; throw err }
        setSmsCreditError('')
        sendDone()
        await reloadThread(selected.id)
        scrollBottom()
      } catch (e: any) {
        // Do NOT silently drop the reply into a live chat nobody is watching —
        // reaching the SMS branch means the customer isn't on a live widget, so a
        // chat fallback goes nowhere. Tell the agent why it didn't send and keep
        // their text so they can retry once SMS is connected.
        console.warn('SMS send failed:', e?.message)
        setSending(false)
        const emsg = String(e?.message || 'SMS failed')
        const emsgClean = emsg.replace(/[.\s]+$/, '')
        if (e?.reason === 'credit') {
          setSmsCreditError(emsgClean)
          showToast('Not enough SMS credit — your message wasn’t sent. Top up to keep texting.')
        } else if (/not included in this plan|upgrade to the/i.test(emsg)) {
          // Plan gate — reveal the "Enable SMS" upsell banner and point them to it.
          setSmsIncluded(false)
          showToast('SMS isn’t on your plan yet — use “Enable SMS” above the reply box to upgrade. Your message wasn’t sent.')
        } else if (/not configured|connect (telnyx|twilio)/i.test(emsg)) {
          showToast('SMS isn’t connected for this workspace yet — connect a number under Integrations to text customers. Your message wasn’t sent.')
        } else {
          showToast(`Couldn’t send SMS: ${emsgClean}. Your message wasn’t sent.`)
        }
      }
      return
    }

    // Last resort: record it in the thread ("Live Chat"). If the customer isn't
    // actually on a live widget and we have no phone/email for them, this message
    // reaches no one — warn the agent instead of silently showing "Delivered".
    if (!visitorOnLiveChat && !smsNumber && !emailTo) {
      showToast('Heads up: no mobile or email on file and the customer isn’t on live chat — this reply was saved to the thread but not delivered. Add a phone or email to reach them.')
    }
    await deliverChat(content, senderName)
    if (voice) tagVoice(sentFrom, voiceSince, voice).then(() => { if (selectedIdRef.current === sentFrom) reloadThread(sentFrom) })
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
      // A reply in someone's Colvy chat goes back to the app: say so (it read
      // "Live Chat" under the reply).
      delivery_channel: String((selected as any).channel || '') === 'colvy' ? 'colvy' : 'chat',
    }
    const { data: sentMsg } = await (supabase as any).from('messages').insert(msg).select().maybeSingle()
    // Push it straight to the visitor's widget. They no longer watch the
    // messages table, so this is what makes a reply appear instantly; if it
    // doesn't arrive, their periodic refetch picks it up.
    broadcastMessage(selected.id, sentMsg || msg)
    await (supabase as any).from('conversations').update({
      last_message: content,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Remember the channel so the next reply continues on it.
      active_channel: 'chat',
    }).eq('id', selected.id)
    draft.discard()
    // Still on this chat? Reset the composer. Moved on? Leave theirs alone.
    if (selectedIdRef.current !== selected.id) return
    setReply('')
    setReplyTo(null)
    setSending(false)
    scrollBottom()
  }

  // ── Assign ─────────────────────────────────────────────────────────────────
  const assignTo = async (member: TeamMember | null) => {
    if (!selected) return
    const me = myName || 'A team member'
    await (supabase as any).from('conversations').update({
      assigned_to: member?.user_id || null,
      assigned_name: member?.name || null,
      status: member ? 'assigned' : 'open',
    }).eq('id', selected.id)
    setSelected(s => s ? { ...s, assigned_to: member?.user_id || null, assigned_name: member?.name || null, status: member ? 'assigned' : 'open' } : s)
    setShowAssignMenu(false)
    if (member) {
      logEvent('assigned', member.user_id && member.user_id === user?.id
        ? `${me} self-assigned this conversation`
        : `${me} assigned this conversation to ${member.name}`)
      // Bell + phone push for the new assignee (the server skips a self-assign).
      if (member.user_id && member.user_id !== user?.id) {
        authFetch('/api/inbox/assigned', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected.id, assigneeId: member.user_id, assignedBy: me }),
        }).catch(() => {})
      }
    } else logEvent('assigned', `${me} unassigned this conversation`)
    loadConversations()
  }

  // ── Update status ──────────────────────────────────────────────────────────
  const setStatus = async (status: string) => {
    if (!selected) return
    const prev = String((selected as any).status || '')
    const wasClosed = ['closed', 'resolved'].includes(prev)
    const nowClosed = ['closed', 'resolved'].includes(status)
    await (supabase as any).from('conversations').update({ status }).eq('id', selected.id)
    setSelected(s => s ? { ...s, status } : s)
    // Log a legible timeline entry for the close/reopen transition; fall back to
    // the generic status_change note for other moves.
    if (nowClosed && !wasClosed) logEvent('closed', 'Enquiry closed.')
    else if (!nowClosed && wasClosed) logEvent('reopened', 'Enquiry opened again.')
    else logEvent('status_change', `Status changed to ${status}`)
    loadConversations()
  }

  // ── Contact save ───────────────────────────────────────────────────────────
  const sendTrackingMessage = async (text: string) => {
    if (!companyId || !selected) return
    const me = myName
    const smsNumber = smsDestination()
    try {
      const { data: trkMsg } = await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_name: me, content: text,
        metadata: { tracking: true },
        delivery_channel: smsNumber ? 'sms' : 'chat',
      }).select().maybeSingle()
      if (trkMsg) broadcastMessage(selected.id, trkMsg)
      await (supabase as any).from('conversations').update({
        last_message: 'Tracking sent', last_message_at: new Date().toISOString(),
      }).eq('id', selected.id)

      if (smsNumber) {
        // The link is already in the text, so don't pass attachments — the SMS
        // route would append a second link.
        await authFetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, conversationId: selected.id, to: smsNumber,
            text, senderName: me, skipChatMessage: true,
          }),
        })
      }
      showToast('Tracking sent')
      await reloadThread(selected.id)
      scrollBottom()
    } catch (e: any) {
      showToast(e.message || 'Could not send tracking')
    }
  }

  const saveContact = async () => {
    if (!companyId) return
    setSavingContact(true)
    if (contact?.id) {
      await (supabase as any).from('contacts').update({ ...editContact, updated_at: new Date().toISOString() }).eq('id', contact.id)
      setContact(c => c ? { ...c, ...editContact } : c)
    } else {
      // Before creating anything, look for a contact we already hold with this
      // email or phone. Saving details on an unlinked conversation used to
      // insert a brand-new row (hard-coded as source 'widget'), which is how
      // the same person ended up in the list two or three times.
      const email = (editContact.email || '').trim().toLowerCase()
      const digits = (editContact.phone || '').replace(/\D/g, '')
      let existing: any = null
      try {
        if (email) {
          const { data } = await (supabase as any).from('contacts')
            .select('*').eq('company_id', companyId).ilike('email', email).limit(1)
          if (data?.length) existing = data[0]
        }
        if (!existing && digits.length >= 8) {
          // Match on the last 9 digits so 0405… and +61405… are the same person.
          const { data } = await (supabase as any).from('contacts')
            .select('*').eq('company_id', companyId).ilike('phone', `%${digits.slice(-9)}%`).limit(1)
          if (data?.length) existing = data[0]
        }
      } catch { /* fall through to creating one */ }

      if (existing) {
        // Fill in any blanks on the record we already have, rather than adding
        // a second one.
        const patch: any = { updated_at: new Date().toISOString() }
        for (const [k, v] of Object.entries(editContact)) {
          if (v !== null && v !== undefined && v !== '' && !existing[k]) patch[k] = v
        }
        await (supabase as any).from('contacts').update(patch).eq('id', existing.id)
        const merged = { ...existing, ...patch }
        setContact(merged)
        await (supabase as any).from('conversations').update({ contact_id: existing.id }).eq('id', selected!.id)
      } else {
        // Genuinely new: record that it came from the inbox, not the widget.
        const { data: newContact } = await (supabase as any).from('contacts')
          .insert({ ...editContact, company_id: companyId, source: 'inbox' }).select().maybeSingle()
        if (newContact) {
          setContact(newContact)
          await (supabase as any).from('conversations').update({ contact_id: newContact.id }).eq('id', selected!.id)
        }
      }
    }
    setShowContactEdit(false)
    setSavingContact(false)
  }

  // ── Accept AI-detected info ────────────────────────────────────────────────
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2200) }

  // The AI team (faces, who's on, which channels): who's answering the open
  // conversation, and each agent's face on what it did.
  const { team: agentTeam, faceOf: agentFaceOf, nameOf: agentNameOf } = useAgentTeam(companyId)
  // The agent that answers this conversation, or null when none does here.
  const answeringRole = (conv: any): string | null => {
    if (!conv || !agentTeam || agentTeam.paused) return null
    const ch = agentChannel(conv.channel)
    if (!ch || !agentTeam.channels.includes(ch)) return null
    return agentTeam.enabled.includes('support') ? 'support' : agentTeam.enabled.includes('reception') ? 'reception' : null
  }
  // null = follow the workspace setting; false = paused for this conversation.
  const setConvAi = async (next: false | null, quiet = false) => {
    if (!selected) return
    await (supabase as any).from('conversations').update({ ai_enabled: next }).eq('id', selected.id)
    setSelected(s => (s ? ({ ...s, ai_enabled: next } as any) : s))
    if (!quiet) showToast(next === false ? 'AI paused here. Your team is answering.' : 'Handed back to the agent')
  }
  // Take control: the AI stops sending here, and the conversation is yours.
  const takeControl = async () => {
    await setConvAi(false, true)
    const me = teamMembers.find(m => m.user_id && m.user_id === user?.id)
    if (me && selected?.assigned_to !== me.user_id) await assignTo(me)
    showToast('You’re answering. The agent won’t send anything here.')
  }

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
        authFetch('/api/woocommerce/update-customer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, email: contact.email, field, value }),
        })
      }
    } catch {}
  }

  const dismissAiField = (field: 'name' | 'phone' | 'email' | 'address', value?: string | null) => {
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
    let contactId = conv.contact_id || conv.contacts?.id
    if (contactId) {
      const { data: existing } = await (supabase as any).from('contacts').select(`${field}, ai_saved_fields`).eq('id', contactId).maybeSingle()
      let current = existing?.[field]
      // Contacts created from a chat carry a placeholder name ("Visitor", or the
      // raw phone number). A real name should replace those — but a name someone
      // actually typed is never overwritten.
      if (field === 'name' && current) {
        const isPlaceholder = /^(visitor|guest|unknown|customer)$/i.test(String(current).trim())
          || /^\+?\d[\d\s()-]{6,}$/.test(String(current).trim())
        if (isPlaceholder) current = null
      }
      if (current) return // already has a real value — don't overwrite
      const marks = Array.from(new Set([...((existing?.ai_saved_fields as string[]) || []), field]))
      await (supabase as any).from('contacts').update({ [field]: value, ai_saved_fields: marks, updated_at: new Date().toISOString() }).eq('id', contactId)
      // Learning the name means the thread can stop saying "+61…" or "Visitor".
      if (field === 'name') {
        try {
          const subj = conv.subject || ''
          const weakSubject = !subj || /^(visitor|guest|unknown|customer)$/i.test(subj.trim())
            || /^\+?\d[\d\s()-]{6,}$/.test(subj.trim())
            || /^New (SMS|Live Chat|Email) Enquiry/i.test(subj)
          if (weakSubject) {
            await (supabase as any).from('conversations').update({ subject: value }).eq('id', conv.id)
            if (selectedRef.current?.id === conv.id) {
              setSelected((c: any) => c ? { ...c, subject: value } : c)
            }
            setConversations(cs => cs.map(c => c.id === conv.id ? { ...c, subject: value } as any : c))
          }
        } catch { /* naming the thread is a nicety */ }
      }
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

  // When searching inside message bodies / notes / tasks / activity (not just
  // the contact card or last message), query those tables server-side and
  // remember which conversations matched, so the list filter includes them.
  useEffect(() => {
    const q = searchTerm.trim()
    if (!q || !companyId || !['all', 'contact', 'messages', 'notes', 'tasks', 'activity', 'ai'].includes(searchScope)) {
      setSearchMsgHits({})
      setSearchExtraConvs([])
      return
    }
    let cancelled = false
    const run = async () => {
      const hits: Record<string, { field: string; snippet: string }> = {}
      const like = `%${q.replace(/[%_]/g, m => '\\' + m)}%`
      // Record a hit once per conversation — the first (most relevant, in scope
      // order) match wins, so "All" doesn't clobber a message match with a
      // weaker one from another table.
      const mark = (id: string, field: string, text: string) => {
        if (id && !hits[id]) hits[id] = { field, snippet: makeSnippet(text, q) }
      }
      const collect = async (table: string, col: string, field: string) => {
        try {
          const { data } = await (supabase as any).from(table)
            .select(`conversation_id, ${col}`).eq('company_id', companyId).ilike(col, like).limit(500)
          for (const r of data || []) if (r.conversation_id) mark(r.conversation_id, field, String(r[col] || ''))
        } catch { /* table/column may not exist; skip */ }
      }
      if (searchScope === 'all' || searchScope === 'messages') await collect('messages', 'content', 'Message')
      if (searchScope === 'all' || searchScope === 'notes') await collect('conversation_notes', 'content', 'Note')
      if (searchScope === 'all' || searchScope === 'tasks') await collect('conversation_tasks', 'text', 'Task')
      if (searchScope === 'all' || searchScope === 'activity') await collect('conversation_events', 'detail', 'Activity')

      // AI-generated content: a call's transcription and AI summary (on the
      // `calls` table, which carries conversation_id), plus the conversation's
      // own AI summary and action items (stored on the conversation row itself).
      if (searchScope === 'all' || searchScope === 'ai') {
        // Calls link to a conversation directly, so the shared collector works.
        await collect('calls', 'ai_summary', 'AI summary')
        await collect('calls', 'transcription', 'Transcript')
        await collect('calls', 'transcript_en', 'Transcript')
        // The conversation-level AI summary keyed by the conversation's own id.
        try {
          const { data } = await (supabase as any).from('conversations')
            .select('id, ai_summary').eq('company_id', companyId).ilike('ai_summary', like).limit(500)
          for (const r of data || []) if (r.id) mark(r.id, 'AI summary', String(r.ai_summary || ''))
        } catch { /* column may not exist; skip */ }
        // Action items live in a jsonb array (ai_todos = [{ text, done }]).
        // ilike can't reach inside jsonb, so pull the rows that have to-dos and
        // match their text in JS. Bounded, and most rows have none.
        try {
          const ql = q.toLowerCase()
          const { data } = await (supabase as any).from('conversations')
            .select('id, ai_todos').eq('company_id', companyId).not('ai_todos', 'is', null).limit(1000)
          for (const r of data || []) {
            const todos = Array.isArray(r.ai_todos) ? r.ai_todos : []
            const hit = todos.find((t: any) => String(typeof t === 'string' ? t : (t?.text || '')).toLowerCase().includes(ql))
            if (hit && r.id) mark(r.id, 'Action item', String(typeof hit === 'string' ? hit : (hit?.text || '')))
          }
        } catch { /* column may not exist; skip */ }
      }

      // Match the WHOLE inbox by the contact's identity (name / email / phone),
      // not just the loaded page. Previously a name search only matched rows
      // already on screen, so a contact further down the list didn't appear
      // until you hit "Load more". Resolve matching contacts, then mark all of
      // their conversations as hits so the pull-in below fetches them.
      if (searchScope === 'all' || searchScope === 'contact') {
        try {
          const safe = q.replace(/[%_]/g, m => '\\' + m).replace(/[(),]/g, ' ')
          const { data: cts } = await (supabase as any).from('contacts')
            .select('id, phone').eq('company_id', companyId)
            .or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(500)
          const cids = (cts || []).map((c: any) => c.id).filter(Boolean)
          // Their phone threads that were never linked to them (started before
          // the contact existed) match by number.
          const tails = Array.from(new Set((cts || []).map((c: any) => digitsOf(c.phone).slice(-9)).filter((t: string) => t.length >= 8))).slice(0, 40)
          if (tails.length) {
            try {
              const { data: cv } = await (supabase as any).from('conversations')
                .select('id').eq('company_id', companyId).is('contact_id', null)
                .or(tails.map(t => `sms_number.ilike.%${t}%`).join(',')).limit(200)
              for (const r of cv || []) if (r.id) mark(r.id, 'contact', '')
            } catch { /* skip */ }
          }
          for (let i = 0; i < cids.length; i += 100) {
            const { data: cv } = await (supabase as any).from('conversations')
              .select('id').eq('company_id', companyId).in('contact_id', cids.slice(i, i + 100)).limit(1000)
            // Contact matches highlight in the row's name/last-message directly,
            // so no snippet is needed — mark the field only.
            for (const r of cv || []) if (r.id) mark(r.id, 'contact', '')
          }
        } catch { /* skip */ }
      }
      if (!cancelled) setSearchMsgHits(hits)

      // Pull in any matching conversations that aren't in the loaded page, so a
      // search reaches the WHOLE inbox — Instagram, Messenger, older threads —
      // not just the most recent 50. Without this, searching "Biki" only found
      // conversations already on screen, which skewed heavily to recent SMS.
      const loadedIds = new Set(conversations.map((c: any) => c.id))
      const missing = Object.keys(hits).filter(id => !loadedIds.has(id))
      if (missing.length && !cancelled) {
        const extra: any[] = []
        for (let i = 0; i < missing.length; i += 100) {
          const { data } = await (supabase as any).from('conversations')
            .select('*').eq('company_id', companyId).in('id', missing.slice(i, i + 100))
          extra.push(...(data || []))
        }
        // Attach contacts for the newly pulled conversations.
        const cids = Array.from(new Set(extra.map((c: any) => c.contact_id).filter(Boolean)))
        if (cids.length) {
          const byId = await contactsByIds(cids as string[])
          for (const c of extra) (c as any).contacts = c.contact_id ? byId[c.contact_id] || null : null
        }
        await linkPhoneThreads(companyId, extra)
        if (!cancelled && extra.length) {
          setSearchExtraConvs(extra)
        }
      } else if (!cancelled) {
        setSearchExtraConvs([])
      }
    }
    const t = setTimeout(run, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [searchTerm, searchScope, companyId])

  // When searching, include conversations pulled in from the deep search that
  // aren't in the loaded page — deduped by id. Also always fold in pinned
  // conversations (matching the current Open/Closed tab) so a pinned chat that
  // has fallen below the loaded page still shows — and stays pinned on reload.
  const convSource = (() => {
    let base: any[] = conversations
    if (searchTerm && searchExtraConvs.length) {
      base = [...base, ...searchExtraConvs.filter(e => !base.some((c: any) => c.id === e.id))]
    }
    if (pinnedExtraConvs.length) {
      const wantClosed = statusFilter === 'closed'
      const extra = pinnedExtraConvs.filter(e => {
        const closed = e.status === 'closed' || e.status === 'resolved'
        if (wantClosed ? !closed : closed) return false
        return !base.some((c: any) => c.id === e.id)
      })
      if (extra.length) base = [...base, ...extra]
    }
    return base
  })()
  // last_message_at parsed once per row per render, not twice per comparison.
  const convTsCache = new Map<any, number>()
  const convTs = (c: any): number => {
    let t = convTsCache.get(c)
    if (t === undefined) { t = parseTs(c.last_message_at)?.getTime() || 0; convTsCache.set(c, t) }
    return t
  }
  const filteredConvs = convSource.filter(c => {
    // Tab guard: the Open tab never shows closed/resolved threads and the Closed
    // tab never shows open ones — even if a stale fetch briefly seeds the wrong
    // set (the 5s poll used to do exactly that). This is the source of truth for
    // which tab a row belongs to; the query is just an optimisation.
    const isClosed = ['closed', 'resolved'].includes(String((c as any).status || ''))
    if ((statusFilter === 'closed') !== isClosed) return false
    // Location filter (whole Inbox & CRM). "all" shows everything; otherwise
    // only conversations assigned to the chosen outlet. Conversations with no
    // location assigned show under "all" only.
    // Assignment tab: All / Assigned to me / Unassigned.
    if (assignFilter === 'mine') {
      if (!user?.id || (c as any).assigned_to !== user.id) return false
    } else if (assignFilter === 'unassigned') {
      if ((c as any).assigned_to) return false
    } else if (assignFilter === 'unread') {
      if (!(c as any).is_unread) return false
    }
    if (locationFilter !== 'all') {
      const loc = (c as any).assigned_location_id || (c as any).location_id || null
      if (loc !== locationFilter) return false
    }
    const ct: any = (c as any).contacts || {}
    // Reported spam drops out of the open inbox (still reachable under Closed).
    if ((c as any).is_spam && statusFilter === 'open') return false
    // Snoozed conversations drop out of the list until their time is up.
    const snz = (c as any).snoozed_until
    if (snz && (parseTs(snz)?.getTime() || 0) > Date.now() && statusFilter === 'open') return false

    // Advanced filters from the Filter panel. These must be evaluated even when
    // the search box is empty — an early `if (!searchTerm) return true` used to
    // sit above this block, so with no search term the function returned before
    // any channel/assignee/source/date filter was ever checked and the Filter
    // panel appeared to do nothing.
    const cc: any = c
    if (filters.channel && (cc.channel || '') !== filters.channel) return false
    if (filters.assignedTo) {
      if (filters.assignedTo === '__unassigned') { if (cc.assigned_to) return false }
      else if (cc.assigned_to !== filters.assignedTo) return false
    }
    if (filters.source) {
      const s = (cc.subject || '').toLowerCase()
      const src = s.startsWith('abandoned cart') ? 'cart' : s.startsWith('order #') ? 'order' : 'chat'
      if (src !== filters.source) return false
    }
    if (filters.dateFrom || filters.dateTo) {
      const t = (parseTs(cc.last_message_at)?.getTime() || 0)
      if (filters.dateFrom && t < new Date(filters.dateFrom).getTime()) return false
      if (filters.dateTo && t > new Date(filters.dateTo).getTime() + 86400000) return false
    }
    // Relationship: a missing value counts as 'customer' (the default for every
    // contact that predates the field). A conversation with no linked contact is
    // excluded once a specific relationship is chosen.
    if (filters.relationship) {
      if ((ct.relationship_type || 'customer') !== filters.relationship) return false
    }
    // Purchased (SKU or title): keep only conversations whose contact has bought
    // a matching product. Needs the woo items map; while it loads, matches are
    // empty, then fill in once loaded.
    if (filters.purchased && filters.purchased.trim()) {
      if (!purchasedMatches(ct.email, filters.purchased)) return false
    }
    // Order status: keep only conversations whose contact has an order in the
    // chosen WooCommerce status. Empty while the map loads, then fills in.
    if (filters.orderStatus) {
      if (!orderStatusMatches(ct.email)) return false
    }
    // No search term: the conversation has passed every active filter above, so
    // it belongs in the list.
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()

    // Scope the text match. "Contact" only looks at the contact card; "messages
    // / notes / tasks / activity" rely on the server-side hits gathered above;
    // "all" combines everything.
    const contactMatch = (ct.name || '').toLowerCase().includes(q)
      || (ct.email || '').toLowerCase().includes(q)
      || (ct.phone || '').toLowerCase().includes(q)
    const surfaceMatch = (c.last_message || '').toLowerCase().includes(q)
      || (c.subject || '').toLowerCase().includes(q)
    const deepHit = !!searchMsgHits[c.id]

    if (searchScope === 'contact') return contactMatch
    if (searchScope === 'messages') return deepHit || surfaceMatch
    if (searchScope === 'notes' || searchScope === 'tasks' || searchScope === 'activity' || searchScope === 'ai') return deepHit
    // 'all'
    return contactMatch || surfaceMatch || deepHit
  })
    .sort((a: any, b: any) => {
      // Pinned conversations float to the top (per-user), then normal ordering.
      const pa = pinnedIds.has(a.id) ? 1 : 0
      const pb = pinnedIds.has(b.id) ? 1 : 0
      if (pa !== pb) return pb - pa
      const ta = convTs(a)
      const tb = convTs(b)
      return filters.oldestFirst ? ta - tb : tb - ta
    })

  // Filter auto-fill. The server returns the newest `convLimit` conversations
  // and every filter except Open/Closed is applied here on the client, so a
  // selective filter (a channel, an order status, the Unread tab, a search…)
  // could leave the visible list nearly empty while matching threads sat beyond
  // the fetched window — the list grew one row at a time on "Load more", and
  // could even read "No conversations yet" with more still to come. When a
  // filter or search is active and few matches are showing, pull the next page
  // automatically until the list is reasonably full or the server runs out.
  // Bounded by a page ceiling so a filter that matches nothing never fetches
  // unboundedly; "Load more" still lets the user go past it by hand.
  const AUTO_FILL_TARGET = 20
  const AUTO_FILL_CEILING = 500
  useEffect(() => {
    const filterActive = assignFilter !== 'all' || locationFilter !== 'all' || activeFilterCount > 0 || !!searchTerm.trim()
    if (!filterActive) return
    if (convLoadingRef.current) return
    if (!hasMoreConvs) return
    if (filteredConvs.length >= AUTO_FILL_TARGET) return
    if (convLimit >= AUTO_FILL_CEILING) return
    setConvLimit(l => l + 50)
  }, [filteredConvs.length, hasMoreConvs, assignFilter, locationFilter, activeFilterCount, searchTerm, convLimit])

  // Keyboard: J / K move down / up the list, R jumps to the reply box. Only
  // when nothing is being typed and no dialog is open (the empty thread pane
  // shows these).
  const kbd = useRef({ list: filteredConvs, selected, select: selectConversation })
  kbd.current = { list: filteredConvs, selected, select: selectConversation }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const k = e.key.toLowerCase()
      if (k !== 'j' && k !== 'k' && k !== 'r') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      // Not while a dialog is showing (some, like Colvy AI, stay in the page hidden).
      const showing = [...document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')].some(el => {
        if (!el.getClientRects().length) return false
        const cs = getComputedStyle(el)
        return cs.visibility !== 'hidden' && cs.pointerEvents !== 'none' && Number(cs.opacity) > 0.01
      })
      if (showing) return
      const { list, selected: cur, select } = kbd.current
      if (k === 'r') {
        // The SMS/chat box, or the email editor (components/EmailComposer).
        const box = textareaRef.current?.isConnected ? textareaRef.current : document.querySelector<HTMLElement>('.email-rte[contenteditable="true"]')
        if (cur && box) { e.preventDefault(); box.focus() }
        return
      }
      if (!list.length) return
      const i = cur ? list.findIndex(c => c.id === cur.id) : -1
      const next = i < 0 ? 0 : k === 'j' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1)
      if (next === i) return
      e.preventDefault()
      select(list[next])
      document.querySelector(`[data-conv-row="${list[next].id}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Where the Colvy chat sits in the list: on top while it has something new
  // (an update, or an answer from the team), otherwise by time like any
  // conversation, below the pinned ones, sinking as newer ones arrive. Not in
  // searches, Closed, filters or views it doesn't belong to (Unread only while
  // unread). Past the loaded page it's left out; the account menu opens it.
  const colvyAt = (() => {
    if (!colvy.available || searchTerm.trim() || statusFilter === 'closed' || activeFilterCount > 0) return -1
    if (assignFilter !== 'all' && !(assignFilter === 'unread' && colvy.unread > 0)) return -1
    if (colvy.unread > 0) return 0
    const t = Date.parse(colvy.last?.at || '')
    if (!Number.isFinite(t)) return -1
    const i = filteredConvs.findIndex(c => !pinnedIds.has(c.id) && (Date.parse((c as any).last_message_at || '') || 0) < t)
    return i >= 0 ? i : hasMoreConvs ? -1 : filteredConvs.length
  })()
  const colvyRowEl = <ColvyChatRow key="colvy-chat" summary={colvy} active={colvyOpen && !selected} onOpen={openColvy} />

  // ── Render ─────────────────────────────────────────────────────────────────
  // (the loading guard is in app/admin/inbox/page.tsx, after this hook runs)

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const fieldBtn = (color: string): React.CSSProperties => ({ width: 26, height: 26, borderRadius: 999, border: 'none', background: '#f4f4f5', cursor: 'pointer', color, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 })
  const cardAction = (bg: string, color: string): React.CSSProperties => ({ width: 42, height: 42, borderRadius: 999, border: 'none', background: bg, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'filter .15s ease, transform .1s ease' })
  // Addresses arrive in two shapes depending on the source: a plain string, or a
  // structured object like { address_1, city, state, postcode, country }.
  // Assigning the object straight into JSX crashed the page with React error #31
  // ("objects are not valid as a React child"), so always flatten to a string.
  const addrToString = (a: any): string => {
    if (!a) return ''
    if (typeof a === 'string') return a.trim()
    if (typeof a === 'object') {
      return [a.address_1, a.address_2, a.city, a.state, a.postcode, a.country]
        .filter(Boolean).map(String).join(', ')
    }
    return String(a)
  }

  // Join address parts WITHOUT repeating anything the first line already
  // contains. WooCommerce billing often stores a fully formatted line in
  // address_1 ("22 BRAMPTON AV, BUTLER WA 6036") while also holding city, state
  // and postcode separately — naively joining them produced
  // "22 BRAMPTON AV, BUTLER WA 6036, Butler, WA, 6036, AU".
  const joinAddressParts = (...parts: any[]): string => {
    const clean = parts.map(p => (p == null ? '' : String(p).trim())).filter(Boolean)
    if (clean.length === 0) return ''
    const out: string[] = []
    for (const part of clean) {
      const soFar = out.join(', ').toLowerCase()
      // Compare loosely: case and punctuation shouldn't decide a duplicate, and
      // "AU" shouldn't be re-added when the line already ends in "Australia".
      const norm = part.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!norm) continue
      const seen = soFar.replace(/[^a-z0-9]/g, '')
      if (seen.includes(norm)) continue
      out.push(part)
    }
    return out.join(', ')
  }
  // ── Block contact / report spam ──────────────────────────────────────────
  const toggleBlockContact = async () => {
    if (!contact?.id || !companyId) return
    const nowBlocked = !(contact as any).is_blocked
    const me = myName || 'A team member'
    if (nowBlocked && !await confirmDialog(`Block ${contact.name || 'this contact'}? Their messages will be marked blocked in the inbox.`)) return
    try {
      await (supabase as any).from('contacts').update({
        is_blocked: nowBlocked,
        blocked_at: nowBlocked ? new Date().toISOString() : null,
        blocked_by: nowBlocked ? me : null,
      }).eq('id', contact.id)
      setContact({ ...(contact as any), is_blocked: nowBlocked } as any)
      // Leave a trace in the thread so the team can see who did it and when.
      if (selected) {
        await logEvent(
          nowBlocked ? 'contact_blocked' : 'contact_unblocked',
          `${me} has ${nowBlocked ? 'blocked' : 'unblocked'} this contact`
        )
      }
      showToast(nowBlocked ? 'Contact blocked' : 'Contact unblocked')
    } catch (e: any) {
      showToast('Could not update: ' + e.message)
    }
  }

  // Conversation protection (lib/conversation-protection): the team says a
  // held-back message is fine. Clears it, takes the conversation out of Spam
  // and trusts this customer from now on.
  const markNotSpam = async () => {
    if (!selected || !companyId || protectionBusy) return
    setProtectionBusy(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/inbox/protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ companyId, conversationId: selected.id, action: 'not_spam' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not update')
      const at = new Date().toISOString()
      setMessages(prev => prev.map((m: any) => m.metadata?.protection && !m.metadata.protection.cleared ? { ...m, metadata: { ...m.metadata, protection: { ...m.metadata.protection, cleared: { by: myName || 'You', at } } } } : m))
      setSelected({ ...(selected as any), is_spam: false, last_message: j.lastMessage ?? (selected as any).last_message } as any)
      if (contact?.id) setContact({ ...(contact as any), trusted_at: at } as any)
      showToast('Marked as not spam')
    } catch (e: any) {
      showToast(e.message || 'Could not update')
    } finally { setProtectionBusy(false) }
  }

  const reportSpam = async () => {
    if (!selected || !companyId) return
    if (!await confirmDialog('Report this conversation as spam? It will be marked spam and closed.')) return
    const me = myName || 'A team member'
    try {
      await (supabase as any).from('conversations').update({
        is_spam: true, status: 'closed',
      }).eq('id', selected.id)
      if (contact?.id) {
        await (supabase as any).from('contacts')
          .update({ spam_reported_at: new Date().toISOString() }).eq('id', contact.id)
      }
      await logEvent('spam_reported', `${me} reported this conversation as spam`)
      showToast('Reported as spam and closed')
      setSelected(null)
      loadConversations()
    } catch (e: any) {
      showToast('Could not report: ' + e.message)
    }
  }

  // Resolve @handles from message text against the team list. The text is the
  // source of truth: relying on the picker state alone missed mentions that
  // were typed out, pasted, or edited after selecting — and could notify
  // someone whose mention had since been deleted.
  const resolveMentions = (text: string): string[] => {
    const handles = Array.from(new Set(
      (String(text || '').match(/@([\w.\-]+)/g) || []).map(h => h.slice(1).toLowerCase())
    ))
    if (!handles.length) return []
    const ids = teamMembers
      .filter((m: any) => {
        const name = String(m.name || '')
        const compact = name.replace(/\s+/g, '').toLowerCase()
        const first = name.split(/\s+/)[0]?.toLowerCase() || ''
        // Match the full compacted name, the first name, or any handle that is
        // a prefix of the compacted name (covers "@Sabin" for "Sabin Gautam").
        return handles.some(h => h === compact || h === first || compact.startsWith(h))
      })
      .map((m: any) => m.user_id)
      .filter(Boolean)
    return Array.from(new Set(ids)) as string[]
  }

  // Highlight @mentions inside an internal note so they stand out.
  const renderWithMentions = (text: string) => {
    const hq = (showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm
    const acc = companyInfo?.accent_color || 'var(--coral)'
    const parts = String(text || '').split(/(@[\w.\-]+)/g)
    return parts.map((p, i) =>
      p.startsWith('@')
        ? <strong key={i} style={{ color: '#b45309', fontStyle: 'normal', background: '#fef3c7', padding: '0 3px', borderRadius: 4 }}>{p}</strong>
        : <span key={i}><Highlight text={p} q={hq} accent={acc} /></span>
    )
  }
  // Team members matching the in-progress @token.
  const mentionMatches = mentionQuery === null ? [] : teamMembers.filter((m: any) =>
    !mentionQuery || (m.name || '').toLowerCase().includes(mentionQuery.toLowerCase())
  ).slice(0, 6)
  // Replace the in-progress "@token" with the chosen member's handle, switch the
  // composer into internal mode (a mention is inherently a staff-only action),
  // and remember them so the note can notify them on send.
  const applyMention = (m: any) => {
    if (!m) return
    const handle = String(m.name || '').replace(/\s+/g, '')
    setReply(prev => prev.replace(/@([\w.\-]*)$/, `@${handle} `))
    setMentionedUsers(prev => prev.some(p => p.user_id === m.user_id) ? prev : [...prev, m])
    setMentionQuery(null)
    setInternalMode(true)
    textareaRef.current?.focus()
  }

  // Instagram theme (Settings → Channels): when on, the open Instagram thread's
  // header + Send button take the Instagram gradient, matching the bubbles.
  const igThemeActive = selected?.channel === 'instagram' && !!(companyInfo as any)?.inbox_settings?.instagram_theme
  const IG_GRADIENT = 'linear-gradient(135deg,#5B51D8 0%,#A033C4 55%,#E1306C 100%)'
  // Messenger theme (Settings → Channels): the equivalent for Facebook Messenger
  // threads — the signature Messenger blue on replies, header + Send button.
  const msgrThemeActive = (selected?.channel === 'facebook' || selected?.channel === 'messenger') && !!(companyInfo as any)?.inbox_settings?.messenger_theme
  const MSGR_GRADIENT = 'linear-gradient(135deg,#00B2FF 0%,#006AFF 100%)'
  // Whichever channel theme is active supplies the accent for shared controls.
  const themeGradient = igThemeActive ? IG_GRADIENT : msgrThemeActive ? MSGR_GRADIENT : null
  const themeSolid = igThemeActive ? '#C13584' : msgrThemeActive ? '#006AFF' : 'var(--coral)'

  return {
    EMOJIS, abandonedCarts, activeCall, activeChannel, activeFilterCount, activePanel, addrToString,
    afterOrderRefund, agentFaceOf, agentNameOf, agentTeam, agentTyping, aiDraft, aiSavedFields, aiSummary,
    aiTodos, answeringRole, anyExpiring, applyBulkExpiry, applyMention, applyQuickResponse,
    assignArrows, assignFilter, assignScrollRef, assignSearch, assignTo, attToken,
    broadcastAgentTyping, bulkCustomDate, bulkExpiryCode, bulkExpiryOpen, canSeeEmailWhy,
    cardAction, cardAssignSearch, channelMenuRef, channelPick, channelResolving, chargeAmount,
    chargeCard, chargeCardId, chargeDesc, charging, chatDraftAnchor, chatGalleryMedia, closeConv,
    colvy, colvyAt, colvyOpen, colvyRowEl, companyId, companyInfo, composeChannel, composerDragging,
    composerH, contact, contactReviews, convActions, convCalls, convHasSale, conversations,
    convertAbandonedCart, copyChatLink, copyConvLink, copyField, couponAmount, couponCode,
    couponExpiry, couponOneTime, couponSaving, couponType, createReviewLink, createTicket, ctxMenu,
    customDateFor, deleteScheduled, deliverToCustomer, dictatedRef, discardTicket,
    dismissAbandonedCart, dismissSalePrompt, doaMatch, downloadInvoice, draft, editContact,
    editField, editFieldValue, editOrder, editOrderData, editOrderLoading, editOrderSaving,
    editingScheduled, emailDraftText, emailFromLabel, emailGalleryMedia, emailSignature,
    emojiBtnRef, events, expirable, expiryChip, expiryDeleteMode, expiryMenuFor, fieldBtn,
    fileInputRef, filteredConvs, filters, filtersCustomDates, fmtRec, folderBtnInbox, forwardBusy,
    forwardPicked, forwardResults, forwardSearch, forwardTo, forwarding, galleryFolder,
    galleryFolders, galleryIndex, galleryItems, galleryMessages, gallerySearch, gallerySelected,
    generateAiSummary, generateInvoice, generatingAi, handleFileUpload, hasMoreConvs, headerName,
    igThemeActive, inp, internalMode, invoicePreview, invoiceSending, isManager, isMobile,
    isOnPageNow, isWebChat, issueOrderRefund, joinAddressParts, lastInboundId, lastThreadScrollTop,
    latestChat, linkCopied, linkedChannels, listAnim, listCollapsed, liveTyping,
    loadConversationExtras, loadConversations, loadGalleryFolder, loadOlderMessages, loading,
    loadingOlder, loadingOlderRef, locationFilter, logAiUpdate, mComposerOpen, mToolsOpen,
    markNotSpam, markOrderCompleted, markRead, mentionIndex, mentionMatches, mentionQuery,
    mergeConversation, messages, messagesEndRef, messagesScrollRef, miniBtn, mobilePane,
    moveMenuRef, moveToOutlet, mrAccept, mrExpiry, mrMaxFiles, mrPrompt, mrSaving, msgMatchIds,
    msgSearch, msgSearchIdx, msgrThemeActive, myName, onAiTasksCreated, openChatMedia,
    openEmailMedia, openForward, openMediaPicker, openMobileComposer, openOrderEditor,
    openScheduleMsg, openTicket, orderBilling, orderDateFrom, orderDateTo, orderGallery,
    orderPrefillCart, orderSearch, outboundChannel, outlets, outletsForSchedule, payAddress,
    payAmount, payDesc, paySending, paymentSignal, pickerItems, pickupModal, pickupSending,
    pinnedIds, podFiles, podNote, podSending, prextyCustomer, productError, productQuery, productSearchedFor,
    productSearching, productSent, products, protectionBusy, quickIndex, quickMatches, quickMenuRef,
    quickMrBusy, reactToMessage, recSeconds, recording, refundOrder, reloadThread, renderLinkTools,
    renderModeHead, renderNotesSection, renderSendMenu, renderTasksSection, renderTextWithLinks,
    renderWithMentions, reopenConv, reply, replyTo, replyTr, reportSpam, requestMediaQuick,
    resetFilters, revealedMsgs, reviewAlready, reviewChannel, saleDismissed, saveCard, saveContact,
    saveOrderEdit, saveSchedule, saveScheduledEdit, saveSingleField, savedCards, savingContact,
    schedule, scheduleMessage, scheduleMsgAt, scheduledBusy, scheduledList, scheduledWhen,
    scheduling, schedulingMsg, scrollBottom, searchForwardTargets, searchMsgHits, searchProducts,
    searchScope, searchTerm, selectConversation, selected, sendAndClose, sendChannel, sendCoupon,
    sendInteractive, sendInvoiceInChat, sendMediaRequest, sendOrderPaymentRequest, sendPayment,
    sendPicker, sendPickupReady, sendProductMessage, sendProofOfDelivery, sendReply,
    sendReviewRequest, sendScheduledNow, sendTrackingMessage, sending, setAbandonedCarts,
    setActivePanel, setAiTodos, setAssignFilter, setAssignSearch, setBulkCustomDate,
    setBulkExpiryOpen, setCardAssignSearch, setChargeAmount, setChargeCardId, setChargeDesc,
    setChatDraftsClosed, setComposerH, setContact, setConvAi, setConvHasSale, setConvLimit,
    setConversations, setCouponAmount, setCouponCode, setCouponExpiry, setCouponOneTime,
    setCouponType, setCtxMenu, setCustomDateFor, setEditContact, setEditField, setEditFieldValue,
    setEditOrder, setEditOrderData, setEditingScheduled, setEmailDraftText, setExpiryDeleteMode,
    setExpiryMenuFor, setFilters, setFiltersCustomDates, setForwardPicked, setForwarding,
    setGalleryIndex, setGallerySearch, setGallerySelected, setInternalMode, setInvoicePreview,
    setLocationFilter, setMComposerOpen, setMToolsOpen, setMentionIndex, setMentionQuery,
    setMobilePane, setMrAccept, setMrExpiry, setMrMaxFiles, setMrPrompt, setMsgSearch,
    setMsgSearchIdx, setOrderDateFrom, setOrderDateTo, setOrderGallery, setOrderPrefillCart,
    setOrderSearch, setPayAddress, setPayAmount, setPayDesc, setPickupModal, setPodFiles,
    setPodNote, setProductQuery, setQuickIndex, setRefundOrder, setReply, setReplyTo,
    setRevealedMsgs, setSchedule, setScheduleMsgAt, setSearchScope, setSearchTerm, setSelected,
    setSendChannel, setSendPicker, setSentiment, setShowActionMenu, setShowActions,
    setShowAddContact, setShowAssignMenu, setShowCardAssign, setShowCardMore, setShowChannelMenu,
    setShowChargeCard, setShowCompose, setShowContactEdit, setShowCoupon, setShowCreateOrder,
    setShowDeliveryPanel, setShowDialer, setShowDoa, setShowEmoji, setShowFilters, setShowInboxQR,
    setShowMediaPicker, setShowMediaRequest, setShowMergePicker, setShowMoveMenu, setShowMsgSearch,
    setShowOrderSearch, setShowPod, setShowProducts, setShowQuickMenu, setShowReactPicker,
    setShowRecordSale, setShowSchedule, setShowScheduleMsg, setShowSnooze, setShowStatusMenu,
    setShowTimeline, setShowTracking, setSidebarCollapsed, setSmsCreditError, setStagedExpiry,
    setStagedMedia, setStatus, setStatusFilter, setStoryView, setTabletContact, setTicketDesc,
    setTicketPriority, setTicketSubject, showActionMenu, showActions, showAddContact,
    showAssignMenu, showCardAssign, showCardMore, showChannelMenu, showChargeCard, showCompose,
    showContactEdit, showCoupon, showCreateOrder, showDeliveryPanel, showDialer, showDoa,
    showEmailComposer, showEmoji, showFilters, showInboxQR, showMediaPicker, showMediaRequest,
    showMergePicker, showMoveMenu, showMsgSearch, showOrderSearch, showOriginalMsgs, showPod,
    showProducts, showQuickMenu, showReactPicker, showRecordSale, showSchedule, showScheduleMsg,
    showSnooze, showStatusMenu, showTimeline, showToast, showTracking, smsCreditError,
    smsDestination, smsIncluded, smsOptOut, snoozeConv, snoozeConversation, stageQrMedia,
    stageSelectedMedia, stagedExpiry, stagedMedia, startComposerResize, statusFilter, stopVoiceNote,
    storyView, tabletContact, takeControl, tasks, teamMembers, templateVars, textareaRef,
    themeGradient, themeSolid, threadIndex, threadWin, threadWinRef, ticketDesc, ticketMode,
    ticketPriority, ticketSaving, ticketSubject, toLocalInput, toast, toggleBlockContact,
    toggleMsgOriginal, togglePin, translateMsg, translatingMsgs, updateOrderStatus, user,
    visibleReadBy, wooCustomer, wooOrders, wooOrdersLoading,
  }
}
