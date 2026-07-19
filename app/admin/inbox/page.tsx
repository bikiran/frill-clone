'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useClickOutside } from '@/lib/use-click-outside'
import Link from 'next/link'
import CallBar from '@/components/CallBar'
import CallCard from '@/components/CallCard'
import Dialer from '@/components/Dialer'
import ComposeMessage from '@/components/ComposeMessage'
import EmailMessage from '@/components/EmailMessage'
import EmailComposer from '@/components/EmailComposer'
import ContactTimeline from '@/components/ContactTimeline'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import DeliveryPanel from '@/components/DeliveryPanel'
import MediaGallery, { MediaItem } from '@/components/MediaGallery'
import DoaPanel from '@/components/DoaPanel'
import CreateOrderPanel from '@/components/CreateOrderPanel'

// ─── Types ────────────────────────────────────────────────────────────────────
type Conversation = {
  id: string; company_id: string; contact_id: string | null
  channel: string; status: string; assigned_to: string | null; assigned_name: string | null
  subject: string | null; visitor_id: string | null
  page_url: string | null; page_title: string | null; page_history: any[]; page_seen_at?: string | null
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
// Channel icons are defined below (CHANNEL_ICON) once the `svg` helper exists —
// they used to be emoji, which render differently on every OS and looked like
// clip-art next to the rest of the UI.

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

  // ── Icons that replace the last of the emoji ──────────────────────────────
  person: (s?: number) => svg(<><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></>, s),
  phone: (s?: number) => svg(<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>, s),
  smile: (s?: number) => svg(<><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>, s),
  meh: (s?: number) => svg(<><circle cx="12" cy="12" r="10"/><line x1="8" y1="15" x2="16" y2="15"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>, s),
  frown: (s?: number) => svg(<><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></>, s),
  chat: (s?: number) => svg(<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/>, s),
  mail: (s?: number) => svg(<><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/></>, s),
  mobile: (s?: number) => svg(<><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>, s),
  send: (s?: number) => svg(<><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></>, s),
}

// Channel icons as components (were emoji: 💬 ✉️ 📱 …, which rendered as
// mismatched clip-art and differ across Windows / macOS / Android).
// Brand logos for the source channels. Simple, recognisable marks in each
// brand's colour — clearer than a generic grey glyph.
const BrandMessenger = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#0084FF"><path d="M12 2C6.3 2 2 6.2 2 11.7c0 2.9 1.2 5.4 3.1 7.1.2.1.3.4.3.6l.1 1.8c0 .6.6 1 1.1.7l2-.9c.2-.1.4-.1.6 0 .9.3 1.9.4 2.8.4 5.7 0 10-4.2 10-9.7C22 6.2 17.7 2 12 2zm6 7.5l-2.9 4.7c-.5.7-1.5.9-2.2.4l-2.3-1.7c-.2-.2-.5-.2-.7 0l-3.1 2.4c-.4.3-1-.2-.7-.6l2.9-4.7c.5-.7 1.5-.9 2.2-.4l2.3 1.7c.2.2.5.2.7 0l3.1-2.4c.4-.3 1 .2.7.6z"/></svg>
)
const BrandInstagram = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24"><defs><radialGradient id="igg" cx="0.3" cy="1" r="1"><stop offset="0" stopColor="#FED576"/><stop offset="0.3" stopColor="#F47133"/><stop offset="0.6" stopColor="#BC3081"/><stop offset="1" stopColor="#4C63D2"/></radialGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igg)"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="17" cy="7" r="1.2" fill="#fff"/></svg>
)
const BrandWhatsApp = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.1.1.3 0 .5l-.3.5c-.1.2-.3.3-.1.6.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.8c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.5.3.1.2.1.7-.1 1.4z"/></svg>
)
const BrandWoo = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#873EFF"><path d="M2 6h20a1 1 0 0 1 1 1.5l-2.5 6a1 1 0 0 1-.9.6H6.5l.4 2h11.6v2H6.2a1 1 0 0 1-1-.8L3.3 6.9 2.2 6.7z"/><circle cx="8" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>
)

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  widget: Icon.chat(16), chat: Icon.chat(16), email: Icon.mail(16), sms: Icon.mobile(16),
  phone: Icon.phone(16), facebook: BrandMessenger(16), messenger: BrandMessenger(16),
  instagram: BrandInstagram(16), whatsapp: BrandWhatsApp(16), woocommerce: BrandWoo(16),
}
const CHANNEL_NAME: Record<string, string> = {
  widget: 'Live chat', chat: 'Live chat', sms: 'SMS', email: 'Email', phone: 'Phone',
  facebook: 'Messenger', messenger: 'Messenger', instagram: 'Instagram', whatsapp: 'WhatsApp',
}
const SENTIMENT_ICON: Record<string, (s?: number) => React.ReactNode> = {
  positive: Icon.smile, neutral: Icon.meh, negative: Icon.frown,
}
const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#16a34a', neutral: '#9ca3af', negative: '#dc2626',
}
const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  open:     { bg: '#fef3c7', color: '#d97706' },
  assigned: { bg: '#dbeafe', color: '#2563eb' },
  resolved: { bg: '#dcfce7', color: '#059669' },
  closed:   { bg: '#f3f4f6', color: '#6b7280' },
}
// Robustly parse a Supabase/Postgres timestamp. The old code appended 'Z' when
// the string didn't already end in 'Z' — but Supabase returns offsets like
// "+00:00", so that produced "…+00:00Z" (two tz markers), which Safari parses as
// Invalid Date → blank timestamps everywhere. This normalises all the shapes:
//   "2026-07-17T11:04:10.891Z"       (already fine)
//   "2026-07-17T11:04:10.891+00:00"  (has offset → leave it)
//   "2026-07-17 11:04:10.891+00"     (space + short offset → normalise)
//   "2026-07-17T11:04:10.891"        (no tz → treat as UTC, append Z)
function parseTs(d: string | undefined | null): Date | null {
  if (!d) return null
  let s = typeof d === 'string' ? d.trim() : String(d)
  if (!s) return null
  s = s.replace(' ', 'T')
  // Normalise a bare 2-digit offset like "+00" → "+00:00" (JS Date rejects the
  // short form). Leave "+00:00", "Z", "+0000" alone.
  s = s.replace(/([+-]\d{2})$/, '$1:00')
  // Already has a timezone (Z or ±HH:MM) → parse as-is.
  const hasTz = /(Z|[+-]\d{2}:?\d{2})$/.test(s)
  if (!hasTz) s = s + 'Z'
  const parsed = new Date(s)
  return isNaN(parsed.getTime()) ? null : parsed
}
function timeAgo(d: string) {
  if (!d) return ''
  const parsed = parseTs(d)
  if (!parsed) return ''
  const s = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000))
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`
}

// Coax-style list timestamp: "6:12 PM - 17/7"
function listTime(d: string) {
  if (!d) return ''
  const parsed = parseTs(d)
  if (!parsed) return ''
  const t = parsed.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${t} · ${parsed.getDate()}/${parsed.getMonth() + 1}`
}

// Safe time formatter — handles null, undefined, and non-ISO timestamps
function fmtTime(d: string | undefined | null) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = parseTs(s)
  if (!parsed) return ''
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
// Formats like "Received 7:18 PM | 08 Jul | Instagram" / "Delivered 2:03 PM | 09 Jul"
function fmtReceipt(d: string | undefined | null, isAgent: boolean, channel?: string) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = parseTs(s)
  if (!parsed) return ''
  const time = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const date = parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
  const label = isAgent ? 'Delivered' : 'Received'
  const NAMES: Record<string, string> = {
    sms: 'SMS', email: 'Email', chat: 'Live Chat', widget: 'Live Chat',
    instagram: 'Instagram', facebook: 'Messenger', messenger: 'Messenger',
    whatsapp: 'WhatsApp', phone: 'Phone Call',
  }
  const chan = channel ? (NAMES[channel.toLowerCase()] || channel.charAt(0).toUpperCase() + channel.slice(1)) : ''
  // Show the channel on BOTH sides — an agent needs to know a reply went by SMS.
  return `${label} ${time} | ${date}${chan ? ` | ${chan}` : ''}`
}
// Interleave conversation events (assignments, channel switches, moves) into the
// message list in chronological order, so the thread reads like a real timeline.
function mergeEvents(msgs: any[], events: any[]) {
  const SHOW = ['assigned', 'channel_switch', 'moved', 'status', 'review_request', 'page_view']
  const evs = (events || [])
    .filter(e => SHOW.includes(e.event_type))
    .map(e => ({ ...e, __event: true }))

  // Postgres timestamps come back with or without a trailing Z depending on the
  // column type. Parsing inconsistently offset events by the local timezone,
  // which shoved them all to the bottom of the thread instead of sorting them
  // in among the messages.
  const ts = (v: any): number => {
    if (!v) return 0
    const s = String(v)
    // Already has a timezone (Z or ±HH:MM) → parse as-is.
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s)
    const d = new Date(hasTz ? s : s.replace(' ', 'T') + 'Z')
    return isNaN(d.getTime()) ? 0 : d.getTime()
  }

  return [...msgs, ...evs].sort((a, b) => ts(a.created_at) - ts(b.created_at))
}

// Returns "Today" / "Yesterday" / "12 Jul 2026" for a date divider
function dayLabel(d: string | undefined | null) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = parseTs(s)
  if (!parsed) return ''
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
  if (!parsed) return ''
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
  const [locationFilter, setLocationFilter] = useState<string>('all')
  // All / Assigned to me / Unassigned tabs above the conversation list.
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all')

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
  const [searchScope, setSearchScope] = useState<'all' | 'contact' | 'messages' | 'activity' | 'tasks' | 'notes'>('all')
  const [searchMsgHits, setSearchMsgHits] = useState<Record<string, boolean>>({})
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

  // ── Saved cards: save a card on file, then charge it later without asking ──
  const [showChargeCard, setShowChargeCard] = useState(false)
  const [savedCards, setSavedCards] = useState<any[]>([])
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

  // ── Schedule a delivery from the chat ────────────────────────────────────
  // Books it into the team calendar so every outlet can see the run, and tells
  // the customer what window to expect.
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [schedule, setSchedule] = useState<any>({
    date: '', time_window: '', address: '', notes: '', location_id: '', notify: true,
  })
  const [outletsForSchedule, setOutletsForSchedule] = useState<any[]>([])

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

  const saveSchedule = async () => {
    if (!companyId || !selected || !schedule.date) return
    setScheduling(true)
    try {
      const who = contact?.name || contact?.email || 'customer'
      const res = await fetch('/api/calendar', {
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
        const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]
        const smsNumber = smsDestination()

        if (smsNumber) {
          try {
            await fetch('/api/telnyx/sms/send', {
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
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
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
    setProductSearching(true)
    setProductError('')
    try {
      const res = await fetch(`/api/orders/products?companyId=${companyId}&q=${encodeURIComponent(productQuery.trim())}`)
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
    finally { setProductSearching(false) }
  }

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
        const r = await fetch('/api/short-links/create', {
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

    const me = user.user_metadata?.display_name || user.email?.split('@')[0]
    const smsNumber = smsDestination()

    try {
      // Shorten the product link for SMS so it isn't a huge ugly URL.
      let smsText = content
      if (smsNumber) {
        const r = await fetch('/api/telnyx/sms/send', {
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

      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
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
      return lead + (r.body || '')
    }))
    setShowQuickMenu(false)
  }

  // ── Live typing preview (ADMIN ONLY) ──────────────────────────────────────
  // See what the customer is typing before they send it, so agents can prepare.
  // The customer is never shown the agent's draft — this is one-way.
  const [liveTyping, setLiveTyping] = useState<string>('')
  useEffect(() => {
    if (!selected?.id) { setLiveTyping(''); return }
    setLiveTyping('')
    const ch = supabase.channel(`typing-${selected.id}`)
    ch.on('broadcast', { event: 'typing' }, (msg: any) => {
      const p = msg?.payload
      if (!p || p.from !== 'visitor') return
      setLiveTyping(p.text || '')
    }).subscribe()
    // Clear the preview if they go quiet.
    const idle = setInterval(() => setLiveTyping(t => t), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(idle) }
  }, [selected?.id])

  const cardsApi = async (body: any) => {
    const res = await fetch('/api/stripe/cards', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, conversationId: selected?.id, ...body }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    return data
  }

  const loadSavedCards = async () => {
    if (!selected || !companyId) return
    try {
      const d = await cardsApi({ action: 'list_cards' })
      setSavedCards(d.cards || [])
      setChargeCardId(d.cards?.[0]?.id || '')
    } catch { setSavedCards([]) }
  }

  // Sends the customer a secure Stripe page to store their card.
  const saveCard = async () => {
    if (!selected || !companyId) return
    try {
      await cardsApi({ action: 'save_card' })
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
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
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
      scrollBottom()
      showToast(d.paid ? 'Card charged successfully' : `Charge status: ${d.status}`)
    } catch (e: any) {
      showToast(e.message)
    } finally {
      setCharging(false)
    }
  }
  const [payDesc, setPayDesc] = useState('')
  const [toast, setToast] = useState('')
  const [editField, setEditField] = useState<string | null>(null)
  const [editFieldValue, setEditFieldValue] = useState('')
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open')

  // ── Filter panel (Coax style) ─────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const [showDialer, setShowDialer] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [emailFromLabel, setEmailFromLabel] = useState('')
  const [linkedChannels, setLinkedChannels] = useState<any[]>([])
  const [showTimeline, setShowTimeline] = useState(false)
  const [emailSignature, setEmailSignature] = useState<string | null>(null)

  // Where is this customer ACTUALLY talking, right now? The conversation's
  // stored channel goes stale the moment someone moves from the web widget to
  // SMS, which is why threads kept insisting they were "live chat" (and kept
  // showing the web page the customer was supposedly "currently on" — data from
  // a visit that may have ended days ago). The newest message wins.
  const activeChannel = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const dc = String((messages[i] as any).delivery_channel || '').toLowerCase()
      if (dc && dc !== 'chat') return dc
    }
    return String((selected as any)?.channel || 'widget').toLowerCase()
  }, [messages, selected?.id, (selected as any)?.channel])

  const isWebChat = ['widget', 'chat'].includes(activeChannel)

  // Load this contact's linked channels (same person across live chat / SMS /
  // Messenger / IG / WooCommerce) for the sidebar's "also reachable on" panel.
  useEffect(() => {
    const cid = contact?.id
    if (!cid) { setLinkedChannels([]); return }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/contacts/linked?contactId=${cid}`)
        const d = await res.json()
        if (!cancelled) setLinkedChannels(d.channels || [])
      } catch { if (!cancelled) setLinkedChannels([]) }
    })()
    return () => { cancelled = true }
  }, [contact?.id])

  // For an email thread, load the sending mailbox so the composer can show the
  // real "From" and append the right signature.
  useEffect(() => {
    if (!selected || String((selected as any).channel || '').toLowerCase() !== 'email') {
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

  // Is the visitor on the page RIGHT NOW? The widget heartbeats page_seen_at
  // every 60s while their tab is open. Fresh (< 2 min) ⇒ show the live banner;
  // stale ⇒ they've left, so the page belongs in history, not in a banner
  // claiming they're "currently on" it. Re-checked every 20s so a banner for
  // someone who just left disappears on its own.
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
  const [showPod, setShowPod] = useState(false)
  const [podNote, setPodNote] = useState('')
  const [podFiles, setPodFiles] = useState<File[]>([])
  const [podSending, setPodSending] = useState(false)
  const [showDeliveryPanel, setShowDeliveryPanel] = useState(false)
  const [filters, setFilters] = useState<any>({
    dateFrom: '', dateTo: '', channel: '', assignedTo: '', source: '', oldestFirst: false,
  })
  const activeFilterCount = ['dateFrom', 'dateTo', 'channel', 'assignedTo', 'source']
    .filter(k => filters[k]).length + (filters.oldestFirst ? 1 : 0)
  const resetFilters = () => setFilters({ dateFrom: '', dateTo: '', channel: '', assignedTo: '', source: '', oldestFirst: false })
  const [showAssignMenu, setShowAssignMenu] = useState(false)
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
  const [hasMoreConvs, setHasMoreConvs] = useState(false)
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
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  const channelRef = useRef<any>(null)
  // Bumped to force the realtime subscription to rebuild after a dropped socket.
  const [realtimeNonce, setRealtimeNonce] = useState(0)

  // ── Forward media to another contact ─────────────────────────────────────
  const [forwarding, setForwarding] = useState<any>(null)   // the attachment
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
    setForwardBusy(true)
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

      const me = user.user_metadata?.display_name || user.email?.split('@')[0]

      // Text it too, if that's how we talk to them.
      const phone = contactTarget.phone
      if (phone) {
        try {
          await fetch('/api/telnyx/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: convId, to: phone,
              text: '', attachments: [forwarding], senderName: me, skipChatMessage: true,
            }),
          })
        } catch {}
      }

      await (supabase as any).from('messages').insert({
        conversation_id: convId, company_id: companyId,
        sender_type: 'agent', sender_id: user.id, sender_name: me, sender_email: user.email,
        content: '', attachments: [forwarding],
        delivery_channel: phone ? 'sms' : 'chat',
        metadata: { forwarded: true },
      })
      await (supabase as any).from('conversations').update({
        last_message: '📎 Attachment', last_message_at: new Date().toISOString(),
      }).eq('id', convId)

      setForwarding(null); setForwardSearch(''); setForwardResults([])
      showToast(`Forwarded to ${contactTarget.name || contactTarget.email}`)
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
    // NOTE: conversations.contact_id has no FK to contacts in some deployments,
    // so a PostgREST embed (`contacts(...)`) fails the WHOLE query and returns
    // nothing (blank inbox). Fetch conversations plainly, then attach contacts.
    let q = (supabase as any).from('conversations').select('*').eq('company_id', id)
    // "Closed" covers closed + resolved; "Open" is everything else.
    if (statusFilter === 'closed') q = q.in('status', ['closed', 'resolved'])
    else q = q.not('status', 'in', '("closed","resolved")')
    const { data } = await q.order('last_message_at', { ascending: false }).limit(convLimit)
    const convs = data || []
    // If we got a full page back there are probably more to load.
    setHasMoreConvs(convs.length >= convLimit)

    // Attach contact details in one extra query.
    const contactIds = Array.from(new Set(convs.map((c: any) => c.contact_id).filter(Boolean)))
    if (contactIds.length) {
      const { data: cts } = await (supabase as any)
        .from('contacts').select('id, name, email, phone').in('id', contactIds)
      const byId: Record<string, any> = {}
      for (const ct of cts || []) byId[ct.id] = ct
      for (const c of convs) (c as any).contacts = c.contact_id ? byId[c.contact_id] || null : null
    }

    setConversations(convs)
    // On first load (desktop), OPEN the top conversation — including its messages
    // and contact — instead of just highlighting it (which left the pane blank).
    if (data && data.length > 0 && !selectedRef.current && typeof window !== 'undefined' && window.innerWidth >= 768) {
      selectConversation(data[0])
    }
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
    if (!showAssignMenu && !showActions && !showCardAssign && !showCardMore) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-assign-menu]')) setShowAssignMenu(false)
      if (!target.closest('[data-actions-menu]')) setShowActions(false)
      if (!target.closest('[data-card-assign]')) setShowCardAssign(false)
      if (!target.closest('[data-card-more]')) setShowCardMore(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssignMenu, showActions, showCardAssign, showCardMore])

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
    // Belt AND braces: a UNIQUE topic per subscription. Even if a previous
    // channel somehow survives (a cleanup that didn't run, a React 18 double
    // mount, a fast back/forward), this new name can never collide with it, so
    // .on() is always called on a fresh, unsubscribed channel.
    const ch = supabase.channel(`inbox-${companyId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        loadConversationsRef.current()
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
        if (selectedRef.current?.id === payload.new.conversation_id) {
          setMessages(prev => {
            if (prev.some((m: any) => m.id === payload.new.id)) return prev
            return [...prev, payload.new]
          })
          scrollBottom()
        }
        // Float the conversation that just got a message to the top of the list
        // immediately, so an active thread that had drifted to the bottom (buried
        // by newer conversations) comes back up without waiting for a reload or a
        // manual scroll.
        setConversations(prev => prev.map((c: any) =>
          c.id === payload.new.conversation_id
            ? { ...c, last_message_at: payload.new.created_at || new Date().toISOString() }
            : c
        ))
        loadConversationsRef.current()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` }, (payload: any) => {
        // Reactions, read receipts and payment status are UPDATEs to the message
        // row. We only listened for INSERTs, so a reaction never showed until
        // the page was reloaded.
        if (selectedRef.current?.id === payload.new.conversation_id) {
          setMessages(prev => prev.map((m: any) => (m.id === payload.new.id ? { ...m, ...payload.new } : m)))
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
        ;(supabase as any).from('messages').select('*')
          .eq('conversation_id', selectedRef.current.id)
          .order('created_at', { ascending: true })
          .then(({ data }: any) => { if (data) setMessages(data) })
        ;(supabase as any).from('conversations').select('*')
          .eq('id', selectedRef.current.id).maybeSingle()
          .then(({ data }: any) => { if (data) setSelected((p: any) => (p ? { ...p, ...data } : p)) })
      }
    }
    document.addEventListener('visibilitychange', revive)
    window.addEventListener('focus', revive)
    window.addEventListener('online', revive)

    // Polling fallback — refresh the open thread every 5s in case realtime
    // isn't enabled on the messages table. (Previously declared after a return
    // statement, so it never ran.) Uses selectedRef so it always polls the
    // currently open conversation without re-running this effect.
    const poll = setInterval(async () => {
      loadConversations()
      const openId = selectedRef.current?.id
      if (openId) {
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', openId).order('created_at', { ascending: true })
        if (msgs && selectedRef.current?.id === openId) setMessages(prev => msgs.length !== prev.length ? msgs : prev)
      }
    }, 5000)

    // ONE cleanup path. The old code had two return statements — the first
    // (listener removal) won, so removeChannel(ch) was dead code and the
    // channel outlived the page, crashing the next visit to the inbox.
    return () => {
      document.removeEventListener('visibilitychange', revive)
      window.removeEventListener('focus', revive)
      window.removeEventListener('online', revive)
      clearInterval(poll)
      try { supabase.removeChannel(ch) } catch {}
      if (channelRef.current === ch) channelRef.current = null
    }
  }, [companyId, realtimeNonce])

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
    // Reconcile any pending Stripe payments straight from Stripe. The webhook
    // may not be configured (or a delivery was missed), which would otherwise
    // leave a paid order showing as "pending" in the chat forever.
    try {
      fetch('/api/stripe/verify-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: conv.id }),
      }).then(r => r.json()).then(d => {
        // If something flipped to paid, refresh the thread so it shows.
        if (d?.updated > 0) {
          ;(supabase as any).from('messages').select('*').eq('conversation_id', conv.id)
            .order('created_at', { ascending: true })
            .then(({ data }: any) => { if (data) setMessages(data) })
        }
      }).catch(() => {})
    } catch {}

    setSelected(conv)
    selectedRef.current = conv
    setMobilePane('thread')
    setAiDetected(null)
    // Clear the PREVIOUS conversation's messages/contact immediately, before the
    // async fetch below resolves. Without this, the old thread's full history
    // stayed on screen — under the newly-clicked contact's name — until the
    // real (often much shorter) data for the new conversation loaded a moment
    // later, which looked like the page "shows the info and then hides it".
    setMessages([])
    setContact(null)
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
    if (!email && !phone) return
    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
    // Match WooCommerce customer by email OR phone.
    let woo: any = null
    if (email) {
      const { data } = await (supabase as any).from('woocommerce_customers')
        .select('*').eq('company_id', companyId).ilike('email', email).maybeSingle()
      woo = data
    }
    if (!woo && phone) {
      // Fall back to phone match (SMS-only contacts with no email on file),
      // using the indexed normalised column from the V186 migration.
      const { data } = await (supabase as any).from('woocommerce_customers')
        .select('*').eq('company_id', companyId).eq('phone_norm', norm(phone)).maybeSingle()
      woo = data || null
      // Backfill this contact's email from the matched customer so order-status
      // automations and future lookups work (SMS contact ↔ WooCommerce customer).
      if (woo?.email && contactId) {
        try { await (supabase as any).from('contacts').update({ email: woo.email }).eq('id', contactId).is('email', null) } catch {}
        email = woo.email
      }
    }
    if (woo) setWooCustomer(woo)

    // Orders by email (covers guest orders too), and ALSO by phone via billing.
    let orders: any[] = []
    if (email) {
      const { data } = await (supabase as any).from('woocommerce_orders')
        .select('*').eq('company_id', companyId).ilike('customer_email', email)
        .order('order_date', { ascending: false }).limit(50)
      orders = data || []
    }
    if (phone) {
      // Phone-matched orders via the indexed normalised column (V186 migration)
      // — no client-side scan of recent orders.
      const { data: byPhone } = await (supabase as any).from('woocommerce_orders')
        .select('*').eq('company_id', companyId).eq('billing_phone_norm', norm(phone))
        .order('order_date', { ascending: false }).limit(50)
      const seen = new Set(orders.map((o: any) => String(o.order_number || o.order_id)))
      for (const o of (byPhone || [])) {
        if (!seen.has(String(o.order_number || o.order_id))) {
          seen.add(String(o.order_number || o.order_id))
          orders.push(o)
        }
      }
      orders.sort((a: any, b: any) => new Date(b.order_date || 0).getTime() - new Date(a.order_date || 0).getTime())
    }
    setWooOrders(orders)
    // Live WooCommerce fetch runs in the background (don't block the panel — the
    // synced orders above already render instantly; live results merge in when
    // ready, catching Colvy-created orders that haven't synced yet).
    if (email) {
      ;(async () => {
      try {
        const res = await fetch(`/api/orders/list?companyId=${companyId}&email=${encodeURIComponent(email!)}`)
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
      })()
    }
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
    // Stamp read_by on every message this agent has now seen — including other
    // agents' replies. "Did my colleague see this?" is the question people
    // actually have, and previously only customer messages were stamped.
    for (const m of msgs) {
      if (m.sender_type === 'system') continue
      // Don't mark your own message as read by yourself — that's meaningless.
      if (m.sender_type === 'agent' && (m as any).sender_id === user?.id) continue
      const readBy = Array.isArray((m as any).read_by) ? (m as any).read_by : []
      if (readBy.some((r: any) => r.name === me)) continue
      const updated = [...readBy, { name: me, initial, at: new Date().toISOString() }]
      await (supabase as any).from('messages').update({
        read_by: updated,
        ...(m.sender_type === 'visitor' ? { is_read: true } : {}),
      }).eq('id', m.id)
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

  // Where should an SMS go? Prefer the number the conversation came in on, but
  // fall back to the contact's mobile — otherwise a chat-originated conversation
  // could never receive media/links by text even when we know their number.
  const smsDestination = (): string | null => {
    const fromConv = (selected as any)?.sms_number
    if (fromConv) return fromConv
    const phone = contact?.phone
    return phone || null
  }

  // ── Channel-aware delivery for actions ──────────────────────────────────────
  // Coupons, payment links, forms, DOA claims, proof of delivery, etc. all
  // ultimately give the customer a LINK. On the live-chat widget we can render a
  // rich card, but on email / SMS / Messenger / Instagram we can only send text
  // — so those channels get a short message with the link. This one helper
  // routes to the right channel so every action doesn't reimplement it.
  //
  // Returns a human string describing what happened (for a toast), or throws.
  const deliverToCustomer = async (opts: { body: string; url?: string | null; subject?: string }): Promise<string> => {
    if (!selected || !companyId) throw new Error('No conversation selected')
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent'
    const ch = activeChannel
    const fullBody = opts.url ? `${opts.body}\n${opts.url}` : opts.body

    if (ch === 'email') {
      const res = await fetch('/api/email/reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: fullBody, agentName: me, subject: opts.subject }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Email failed')
      return 'Sent by email'
    }

    if (ch === 'instagram' || ch === 'facebook') {
      const res = await fetch('/api/meta/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: selected.id, content: fullBody, agentName: me }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Message failed')
      return ch === 'instagram' ? 'Sent on Instagram' : 'Sent on Messenger'
    }

    const smsNumber = smsDestination()
    if (ch === 'sms' && smsNumber) {
      const res = await fetch('/api/telnyx/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: fullBody, senderName: me }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'SMS failed')
      return 'Sent by SMS'
    }

    // Live-chat widget (or anything else): drop it into the thread. Also text a
    // copy if we happen to have a mobile, so they get it off the site too.
    await (supabase as any).from('messages').insert({
      conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
      sender_id: user?.id, sender_name: me, content: fullBody,
      delivery_channel: 'chat',
    })
    await (supabase as any).from('conversations').update({ last_message: opts.body.slice(0, 120), last_message_at: new Date().toISOString() }).eq('id', selected.id)
    if (smsNumber) {
      try {
        await fetch('/api/telnyx/sms/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, conversationId: selected.id, to: smsNumber, text: fullBody, senderName: me, skipChatMessage: true }),
        })
      } catch {}
    }
    return 'Sent in chat'
  }

  const sendGalleryMedia = async () => {
    if (!companyId || !selected || gallerySelected.size === 0) return
    const chosen = galleryItems.filter(it => gallerySelected.has(it.id))
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]
    const smsNumber = smsDestination()
    try {
      for (const item of chosen) {
        const attachment = { url: item.url, name: item.title || 'media', type: item.kind === 'video' ? 'video/mp4' : 'image/jpeg', kind: item.kind, from_gallery: true }

        // On an SMS conversation, actually TEXT the customer a link to the media
        // (as a short colvy.com/m/… viewer). Without this the media only appeared
        // in the chat thread and the customer received nothing.
        if (smsNumber) {
          try {
            const r = await fetch('/api/telnyx/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId, conversationId: selected.id, to: smsNumber,
                text: '', attachments: [attachment], senderName: me,
                skipChatMessage: true,
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
          delivery_channel: smsNumber ? 'sms' : 'chat',
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
        const attachment = { url: data.url, name: data.name, type: data.type, kind: data.kind }

        // Text the customer a link to the media when we have a mobile for them.
        // Previously the file was only inserted into the chat thread and never
        // sent — so the customer received nothing at all.
        const smsNumber = smsDestination()
        if (smsNumber) {
          try {
            const r = await fetch('/api/telnyx/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyId, conversationId: selected.id, to: smsNumber,
                text: data.kind === 'file' ? `📎 ${data.name}` : '',
                attachments: [attachment],   // becomes a short colvy.com/m/… link
                senderName: me,
                skipChatMessage: true,       // we insert our own richer message below
              }),
            })
            const rd = await r.json()
            // Never hide a failed text — otherwise the agent believes the
            // customer received it when they didn't.
            if (!r.ok) showToast(`Saved to the chat, but the SMS failed: ${rd.error || 'unknown error'}`)
          } catch (e: any) { showToast('Saved to the chat, but the SMS failed to send.') }
        }

        // Meta channels (Messenger / Instagram): push the media through the
        // Send API so the customer actually receives the photo/video/file.
        const metaCh = activeChannel
        let deliveredOk = true
        if (metaCh === 'instagram' || metaCh === 'facebook') {
          try {
            const r = await fetch('/api/meta/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationId: selected.id,
                attachmentUrl: attachment.url,
                attachmentKind: attachment.kind,
                content: '',
                agentName: me,
                skipChatMessage: true,
              }),
            })
            const rd = await r.json()
            if (!r.ok) { deliveredOk = false; showToast(`Photo NOT delivered — ${rd.error || 'unknown error'}`) }
          } catch (e: any) { deliveredOk = false; showToast(`Photo NOT delivered: ${e?.message || 'send failed'}`) }
        } else if (metaCh === 'email') {
          // Email: send the file as a link (the customer gets the full-quality
          // original, and it works in every mail client).
          try {
            const r = await fetch('/api/email/reply', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                conversationId: selected.id, agentName: me,
                content: `${data.kind === 'file' ? data.name : 'Photo'} attached:\n${attachment.url}`,
              }),
            })
            const rd = await r.json()
            if (!r.ok) { deliveredOk = false; showToast(`Email NOT sent — ${rd.error || 'unknown error'}`) }
          } catch (e: any) { deliveredOk = false; showToast(`Email NOT sent: ${e?.message || 'failed'}`) }
        }

        await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_id: user.id, sender_name: me, sender_email: user.email,
          content: data.kind === 'file' ? `📎 ${data.name}` : '',
          attachments: [attachment],
          delivery_channel: ['instagram', 'facebook', 'email'].includes(metaCh) ? metaCh : (smsNumber ? 'sms' : 'chat'),
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
          fetch('/api/mentions/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: selected.id, userIds: ids,
              mentionedBy: author, preview: body.slice(0, 300),
              context: `a note on ${contact?.name || selected.subject || 'a conversation'}`,
            }),
          }).catch(() => {})
      }
    } catch { /* the note itself is saved either way */ }
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
  const [reviewSending, setReviewSending] = useState(false)
  const sendReviewRequest = async () => {
    if (!selected || !companyId || reviewSending) return
    setReviewSending(true)
    try {
      const me = user?.user_metadata?.display_name || user?.email?.split('@')[0]

      // Build a branded short link to the business's Google review page, so the
      // customer gets company.colvy.com/m/xxxx (trustworthy in an SMS) that
      // redirects to Google. Falls back to a plain message if no review link is
      // configured yet.
      let reviewShortLink = ''
      try {
        const res = await fetch('/api/short-links/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, kind: 'review', conversationId: selected.id }),
        })
        const d = await res.json()
        if (res.ok && d.url) reviewShortLink = d.url
      } catch {}

      const body = reviewShortLink
        ? `We'd love your feedback! Could you take a moment to leave us a review? ⭐\n${reviewShortLink}`
        : "We'd love your feedback! Could you take a moment to leave us a review? ⭐"

      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_id: user.id, sender_name: me,
        content: body,
        metadata: { review_request: true },
      })
      await (supabase as any).from('conversations').update({ review_requested: true, last_message_at: new Date().toISOString() }).eq('id', selected.id)
      logEvent('review_request', 'Review request sent')
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || [])
      scrollBottom()
    } finally {
      setReviewSending(false)
    }
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

  // Mark a processing order as completed in WooCommerce. This usually triggers
  // the store's "order complete" email, so it confirms first.
  const markOrderCompleted = async (payload: any) => {
    if (!companyId) return
    const orderId = payload.order_id || payload.id
    if (!orderId) { showToast('No order id for this order'); return }
    if (!confirm(`Mark order #${payload.order_number || orderId} as completed?\n\nThis updates WooCommerce and may send the customer a completion email.`)) return
    try {
      const res = await fetch('/api/orders/status', {
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
      if (selected) { loadWooData(contact?.id || null); loadConversationExtras(selected.id) }
    } catch (e: any) {
      alert('Could not mark the order completed: ' + e.message)
    }
  }

  // Turn a pasted URL into a branded short link and drop it into the reply.
  const shortenIntoReply = async () => {
    const raw = shortenInput.trim()
    if (!raw || !companyId) return
    setShortenBusy(true); setShortenError('')
    try {
      const res = await fetch('/api/short-links/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, kind: 'redirect', url: raw,
          conversationId: selected?.id || undefined,
          sentBy: user?.user_metadata?.display_name || user?.email?.split('@')[0] || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not shorten that URL')
      setReply(r => (r.trim() ? `${r.trimEnd()} ${d.url}` : d.url))
      setShowShortener(false); setShortenInput('')
    } catch (e: any) {
      setShortenError(e.message)
    } finally { setShortenBusy(false) }
  }

  // Refund a paid order. This moves real money through the payment gateway, so
  // it always confirms first and states the amount.
  const issueOrderRefund = async (payload: any) => {
    if (!companyId) return
    const orderId = payload.order_id || payload.id
    const total = Number(payload.total || 0)
    if (!orderId) { showToast('No order id for this order'); return }
    const amountText = total ? `$${total.toFixed(2)}` : 'the full order total'
    if (!confirm(`Refund ${amountText} for order #${payload.order_number || orderId}?\n\nThis returns the money to the customer through the payment gateway and cannot be undone here.`)) return
    try {
      const res = await fetch('/api/orders/refund', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, orderId,
          integrationId: payload.integration_id || undefined,
          conversationId: selected?.id || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Refund failed')
      showToast(`Refunded $${Number(data.amount || total).toFixed(2)}`)
      if (selected) { loadWooData(contact?.id || null); loadConversationExtras(selected.id) }
    } catch (e: any) {
      alert('Could not issue the refund: ' + e.message)
    }
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

      // Non-widget channels: send the upload link (the in-chat uploader can't
      // render on email/SMS/Messenger/Instagram).
      let how = 'sent'
      if (activeChannel !== 'widget' && activeChannel !== 'chat' && data.link) {
        try {
          how = await deliverToCustomer({
            subject: `${companyInfo?.name || 'We'} need a few files from you`,
            body: `${mrPrompt.trim() || 'Please upload the requested files.'}\nUpload here:`,
            url: data.link,
          })
        } catch (e: any) { showToast(`Request created, but sending failed: ${e.message}`); setMrSaving(false); return }
      }
      showToast(`Media request ${how.toLowerCase()}`)
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

      // On a non-widget channel, the in-chat coupon card can't render — send the
      // code and a shop link over whatever channel the customer is on.
      let how = 'sent'
      if (activeChannel !== 'widget' && activeChannel !== 'chat') {
        const shop = (companyInfo as any)?.store_url || ''
        const amount = couponType === 'percent' ? `${couponAmount.trim()}%` : `$${couponAmount.trim()}`
        try {
          how = await deliverToCustomer({
            subject: `A ${amount} coupon from ${companyInfo?.name || 'us'}`,
            body: `Here's ${amount} off your next order — use code ${data.code} at checkout.${couponExpiry ? ` Valid for ${couponExpiry} days.` : ''}`,
            url: shop || null,
          })
        } catch (e: any) { showToast(`Coupon created, but sending failed: ${e.message}`); setCouponSaving(false); return }
      }
      showToast(`Coupon ${data.code} ${how.toLowerCase()}`)
      selectConversation(selected)
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
      const attachments: any[] = []
      for (const file of podFiles) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('companyId', companyId)
        fd.append('conversationId', selected.id)
        const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) { showToast('Photo upload failed: ' + (data.error || 'error')); continue }
        attachments.push({ url: data.url, name: data.name, type: data.type, kind: data.kind })
      }

      const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent'
      const note = podNote.trim() || 'Your order has been delivered. Attached is the proof of delivery — thank you!'

      // Include the direct link(s) as well as the attachment. Chat and SMS
      // previews are recompressed, so a link is the only way the customer gets
      // the ORIGINAL full-quality photo and can download/keep it.
      const links = attachments.map(a => a.url).filter(Boolean)
      const body = links.length
        ? `${note}\n\n${links.length > 1 ? 'Download the full-quality photos:' : 'Download the full-quality photo:'}\n${links.join('\n')}`
        : note

      await (supabase as any).from('messages').insert({
        conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
        sender_name: me, content: body, attachments,
        metadata: { proof_of_delivery: true },
      })
      await (supabase as any).from('conversations').update({
        last_message: 'Proof of delivery sent', last_message_at: new Date().toISOString(),
      }).eq('id', selected.id)

      // Text it too, when we have a mobile.
      const smsNumber = smsDestination()
      if (smsNumber) {
        try {
          await fetch('/api/telnyx/sms/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId, conversationId: selected.id, to: smsNumber,
              text: body,
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

    // For any non-widget channel, send a link to respond (the interactive card
    // only renders inside the live-chat widget). Was SMS-only before.
    if (activeChannel !== 'widget' && activeChannel !== 'chat') {
      try {
        await deliverToCustomer({
          subject: title,
          body: `${title}\nTap to respond:`,
          url: link,
        })
      } catch (e: any) { showToast(`Saved, but sending failed: ${e.message}`) }
    } else if (smsNumber) {
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
      // On non-widget channels the payment card can't render — send the pay
      // link over the customer's channel. (Was SMS-only.)
      if (data.checkoutUrl && activeChannel !== 'widget' && activeChannel !== 'chat') {
        try {
          await deliverToCustomer({
            subject: `Payment request from ${companyInfo?.name || 'us'}`,
            body: `Payment request: $${parseFloat(payAmount).toFixed(2)} AUD${payDesc ? ` — ${payDesc}` : ''}\nPay securely:`,
            url: data.checkoutUrl,
          })
        } catch (e) { showToast(`Payment created, but sending failed: ${(e as any).message}`) }
      }
      setSendPicker(null); setPayAmount(''); setPayDesc('')
      const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
      setMessages(msgs || []); scrollBottom()
    } catch (e: any) { alert('Payment error: ' + e.message) }
  }

  // Send the composer text. Channel is auto-routed unless the agent forces one
  // from the Send dropdown.
  const [sendChannel, setSendChannel] = useState<'auto' | 'chat' | 'sms' | 'email'>('auto')
  const [showChannelMenu, setShowChannelMenu] = useState(false)

  // Right-click context menu on the conversation list.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; conv: any } | null>(null)

  // ── Move or view enquiries across outlets ─────────────────────────────────
  const [showMoveMenu, setShowMoveMenu] = useState(false)

  // Close dropdowns when clicking anywhere else (or pressing Escape). Menus that
  // only close by re-clicking the same button are quietly infuriating.
  const sendMenuRef = useRef<HTMLDivElement>(null)
  const channelMenuRef = useRef<HTMLDivElement>(null)
  const moveMenuRef = useRef<HTMLDivElement>(null)
  const quickMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(showSendMenu, () => setShowSendMenu(false), [sendMenuRef])
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
      event_type: 'moved', actor_name: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Agent',
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
    await (supabase as any).from('conversations').update({ is_unread: false, unread_count: 0 }).eq('id', conv.id)
    loadConversations()
  }
  const snoozeConv = async (conv: any, hours: number) => {
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString()
    await (supabase as any).from('conversations').update({ snoozed_until: until }).eq('id', conv.id)
    loadConversations()
    showToast(`Snoozed for ${hours}h`)
  }
  const closeConv = async (conv: any) => {
    await (supabase as any).from('conversations').update({ status: 'closed' }).eq('id', conv.id)
    loadConversations()
    showToast('Enquiry closed')
  }
  const copyConvLink = (conv: any) => {
    const url = `${window.location.origin}/admin/inbox?conversation=${conv.id}`
    navigator.clipboard?.writeText(url)
    showToast('Link copied')
  }

  const sendReply = async () => {
    if (!reply.trim() || !selected || !user) return
    setSending(true)
    const content = reply.trim()
    const senderName = user.user_metadata?.display_name || user.email?.split('@')[0]

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
        const { data: inserted } = await (supabase as any).from('messages').insert({
          conversation_id: selected.id, company_id: companyId, sender_type: 'agent',
          sender_name: senderName, content, is_internal: true,
          mentions: mentionedIds,
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
          fetch('/api/mentions/notify', {
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
        setReply(''); setReplyTo(null); setSending(false)
        setInternalMode(false); setMentionedUsers([])
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        setMessages(msgs || [])
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        alert('Could not save the internal note: ' + e.message)
      }
      return
    }

    // Instagram / Messenger conversations reply through the Meta Send API.
    if ((selected as any).channel === 'instagram' || (selected as any).channel === 'facebook') {
      try {
        const res = await fetch('/api/meta/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Message failed to send')
        setReply(''); setReplyTo(null); setSending(false)
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        setMessages(msgs || [])
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        alert('Could not send: ' + e.message)
      }
      return
    }

    // Email conversations reply by email (threaded back into the customer's
    // original message), not through the chat widget.
    if ((selected as any).channel === 'email' || sendChannel === 'email') {
      try {
        const res = await fetch('/api/email/reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Email failed to send')
        setReply(''); setReplyTo(null); setSending(false)
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        setMessages(msgs || [])
        scrollBottom()
      } catch (e: any) {
        setSending(false)
        alert('Could not send the email: ' + e.message)
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
    // Is the visitor actually sitting in the widget? Use ONLY the widget's own
    // heartbeat (page_seen_at, refreshed every 60s while their tab is open).
    // This previously fell back to last_message_at — which the AGENT'S own
    // replies update — so sending two messages in a row made the visitor look
    // online and the reply went into a live chat nobody was watching.
    const visitorOnline = isOnPageNow
    const activeChannel = (selected as any).active_channel || null
    const shouldSms = sendChannel === 'sms'
      ? !!smsNumber
      : sendChannel === 'chat'
        ? false
        : !!smsNumber && (activeChannel === 'sms' || !visitorOnline)

    // If we can't use SMS and the visitor isn't sitting in the widget, fall back
    // to email rather than dropping the reply into a chat nobody is watching.
    // Order of preference: continue the last-used channel → SMS → email → chat.
    const emailTo = contact?.email || (selected as any).customer_email || null
    const shouldEmail = sendChannel === 'auto'
      && !shouldSms
      && !visitorOnline
      && !!emailTo

    if (shouldEmail) {
      const prevChannel = (selected as any).active_channel || 'chat'
      try {
        if (prevChannel !== 'email') {
          await (supabase as any).from('conversations').update({ active_channel: 'email' }).eq('id', selected.id)
          await (supabase as any).from('conversation_events').insert({
            conversation_id: selected.id, company_id: companyId,
            event_type: 'channel_switch', actor_name: senderName,
            detail: 'Now replying by email',
          })
        }
        const res = await fetch('/api/email/reply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: selected.id, content, agentName: senderName, to: emailTo }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Email failed to send')
        setReply(''); setReplyTo(null); setSending(false)
        const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
        setMessages(msgs || [])
        scrollBottom()
      } catch (e: any) {
        // Email failed — the chat widget is the last resort so the reply is at
        // least recorded and visible if they come back.
        console.warn('Email failed, delivering via chat:', e.message)
        await deliverChat(content, senderName)
      }
      return
    }

    if (shouldSms) {
      // Tell the agent (and the record) that the conversation moved to SMS.
      const prevChannel = (selected as any).active_channel || 'chat'
      if (prevChannel !== 'sms') {
        try {
          await (supabase as any).from('conversations').update({ active_channel: 'sms' }).eq('id', selected.id)
          await (supabase as any).from('conversation_events').insert({
            conversation_id: selected.id, company_id: companyId,
            event_type: 'channel_switch', actor_name: senderName,
            detail: 'Now chatting through SMS',
          })
        } catch {}
      }
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
      // Remember the channel so the next reply continues on it.
      active_channel: 'chat',
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

  // When searching inside message bodies / notes / tasks / activity (not just
  // the contact card or last message), query those tables server-side and
  // remember which conversations matched, so the list filter includes them.
  useEffect(() => {
    const q = searchTerm.trim()
    if (!q || !companyId || !['all', 'messages', 'notes', 'tasks', 'activity'].includes(searchScope)) {
      setSearchMsgHits({})
      return
    }
    let cancelled = false
    const run = async () => {
      const hits: Record<string, boolean> = {}
      const like = `%${q.replace(/[%_]/g, m => '\\' + m)}%`
      const collect = async (table: string, col: string) => {
        try {
          const { data } = await (supabase as any).from(table)
            .select('conversation_id').eq('company_id', companyId).ilike(col, like).limit(500)
          for (const r of data || []) if (r.conversation_id) hits[r.conversation_id] = true
        } catch { /* table/column may not exist; skip */ }
      }
      if (searchScope === 'all' || searchScope === 'messages') await collect('messages', 'content')
      if (searchScope === 'all' || searchScope === 'notes') await collect('conversation_notes', 'content')
      if (searchScope === 'all' || searchScope === 'tasks') await collect('conversation_tasks', 'text')
      if (searchScope === 'all' || searchScope === 'activity') await collect('conversation_events', 'detail')
      if (!cancelled) setSearchMsgHits(hits)
    }
    const t = setTimeout(run, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [searchTerm, searchScope, companyId])

  const filteredConvs = conversations.filter(c => {
    // Location filter (whole Inbox & CRM). "all" shows everything; otherwise
    // only conversations assigned to the chosen outlet. Conversations with no
    // location assigned show under "all" only.
    // Assignment tab: All / Assigned to me / Unassigned.
    if (assignFilter === 'mine') {
      if (!user?.id || (c as any).assigned_to !== user.id) return false
    } else if (assignFilter === 'unassigned') {
      if ((c as any).assigned_to) return false
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
    if (searchScope === 'notes' || searchScope === 'tasks' || searchScope === 'activity') return deepHit
    // 'all'
    return contactMatch || surfaceMatch || deepHit
  })
    .sort((a: any, b: any) => {
      const ta = (parseTs(a.last_message_at)?.getTime() || 0)
      const tb = (parseTs(b.last_message_at)?.getTime() || 0)
      return filters.oldestFirst ? ta - tb : tb - ta
    })

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--slate)' }}>Loading inbox…</div>

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const fieldBtn = (color: string): React.CSSProperties => ({ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flexShrink: 0 })
  const cardAction = (bg: string, color: string): React.CSSProperties => ({ width: 46, height: 46, borderRadius: 12, border: 'none', background: bg, color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' })
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
  // ── Block contact / report spam ──────────────────────────────────────────
  const toggleBlockContact = async () => {
    if (!contact?.id || !companyId) return
    const nowBlocked = !(contact as any).is_blocked
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'A team member'
    if (nowBlocked && !confirm(`Block ${contact.name || 'this contact'}? Their messages will be marked blocked in the inbox.`)) return
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

  const reportSpam = async () => {
    if (!selected || !companyId) return
    if (!confirm('Report this conversation as spam? It will be marked spam and closed.')) return
    const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'A team member'
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
    const parts = String(text || '').split(/(@[\w.\-]+)/g)
    return parts.map((p, i) =>
      p.startsWith('@')
        ? <strong key={i} style={{ color: '#b45309', fontStyle: 'normal', background: '#fef3c7', padding: '0 3px', borderRadius: 4 }}>{p}</strong>
        : <span key={i}>{p}</span>
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

          /* ── Customer top details: native mobile chat header ──────────
             Row 1 is the identity bar (back · name · call · contact) — the
             pattern every phone messaging app uses. Row 2 is a single
             horizontally-scrollable strip of tools. Previously ~10 controls
             wrapped into three ragged rows and ate a third of the screen. */
          .inbox-thread-header {
            padding: 6px 8px 0 !important;
            gap: 8px !important;
            align-items: center;
            position: sticky; top: 0; z-index: 20;
            /* iOS-style translucent bar */
            background: rgba(255,255,255,0.92) !important;
            backdrop-filter: saturate(180%) blur(12px);
            -webkit-backdrop-filter: saturate(180%) blur(12px);
          }
          .inbox-thread-header .inbox-header-name {
            flex: 1 1 auto !important;
            min-width: 0 !important;
          }
          .inbox-thread-header .inbox-header-name p:first-child { font-size: 16px !important; }

          /* Row 2 — the scrolling tool strip. It shares this row with Assign and
             the ⋯ menu (which sit at the end): the strip flexes to fill whatever
             space is left rather than claiming 100% and pushing them onto a
             third row, which ate a big chunk of a phone screen. */
          .inbox-thread-header .inbox-header-tools {
            order: 10;
            flex: 1 1 0;
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 6px;
            margin-top: 6px;
            padding: 6px 0 8px;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            /* fade the right edge so it's obvious there's more to scroll */
            -webkit-mask-image: linear-gradient(to right, #000 88%, transparent 100%);
            mask-image: linear-gradient(to right, #000 88%, transparent 100%);
          }
          .inbox-thread-header .inbox-header-tools::-webkit-scrollbar { display: none; }
          /* Assignment tabs scroll horizontally without a visible scrollbar. */
          .inbox-assign-tabs { scrollbar-width: none; -webkit-overflow-scrolling: touch; }
          .inbox-assign-tabs::-webkit-scrollbar { display: none; }

          /* Overdue badge tooltip — appears INSTANTLY on hover (no browser
             title-delay), larger, with a quick pop animation. */
          .overdue-badge .overdue-tip {
            position: absolute;
            top: 50%;
            right: calc(100% + 8px);
            transform: translateY(-50%) scale(0.92);
            transform-origin: right center;
            width: 230px;
            background: #1f2937;
            color: #fff;
            font-size: 12.5px;
            line-height: 1.4;
            font-weight: 500;
            padding: 9px 12px;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.22);
            opacity: 0;
            pointer-events: none;
            z-index: 100;
            transition: opacity 90ms ease, transform 90ms ease;
          }
          .overdue-badge:hover .overdue-tip {
            opacity: 1;
            transform: translateY(-50%) scale(1);
          }
          .overdue-badge .overdue-tip::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 100%;
            transform: translateY(-50%);
            border: 6px solid transparent;
            border-left-color: #1f2937;
          }
          .inbox-thread-header .inbox-header-tools > * { flex-shrink: 0; }

          /* Bigger, thumb-friendly hit targets (Apple's 44px guidance) */
          .inbox-thread-header .inbox-header-tools button { min-height: 36px; }
          .inbox-thread-header [data-callbar-btn] { padding: 8px 12px !important; }

          /* Assign and the ⋯ menu are siblings AFTER the horizontally-scrolling
             tools strip. On mobile the strip takes a full-width row and these
             wrapped below it, but the strip's right-edge mask and overflow could
             sit over them and swallow taps. Force them above the strip and give
             them real hit targets so they're always tappable. */
          .inbox-thread-header [data-assign-menu],
          .inbox-thread-header [data-actions-menu] {
            position: relative;
            z-index: 5;
            /* Sit at the end of the tools row (order 10) rather than wrapping
               under a long name and shoving the layout around. */
            order: 11;
            flex: 0 0 auto;
            margin-top: 6px;
          }
          .inbox-thread-header [data-assign-menu] > button { min-height: 38px; padding: 8px 14px !important; }
          .inbox-thread-header [data-actions-menu] > button { min-width: 38px; min-height: 38px; }
          /* The dropdowns must escape the tools strip's overflow clipping. */
          .inbox-thread-header [data-assign-menu] > div,
          .inbox-thread-header [data-actions-menu] > div { z-index: 200; }

          /* ── Native-app feel ───────────────────────────────────────────────
             The pane switching above already gives a phone layout; these make it
             behave like an installed app rather than a website in a browser. */

          /* Fill the real visible viewport. 100vh on iOS Safari includes the
             address bar, so the composer sat below the fold; dvh tracks the
             browser chrome as it hides and shows. */
          .inbox-root {
            height: 100dvh !important;
            max-height: 100dvh !important;
            overflow: hidden;
          }

          /* Respect the notch and the home indicator. */
          .inbox-thread-header { padding-top: max(6px, env(safe-area-inset-top)) !important; }
          .inbox-composer {
            padding-bottom: max(8px, env(safe-area-inset-bottom)) !important;
            position: sticky; bottom: 0; z-index: 30;
            background: rgba(255,255,255,0.96);
            backdrop-filter: saturate(180%) blur(12px);
            -webkit-backdrop-filter: saturate(180%) blur(12px);
            border-top: 1px solid var(--border);
          }

          /* iOS zooms the whole page when a focused input is under 16px. */
          .inbox-root input,
          .inbox-root textarea,
          .inbox-root select { font-size: 16px !important; }

          /* Momentum scrolling, and stop the rubber-band effect dragging the
             whole page when a list hits its end. */
          .inbox-root .inbox-col-list,
          .inbox-root .inbox-col-thread,
          .inbox-root .inbox-col-contact,
          .inbox-messages {
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
          }

          /* No grey flash on tap, and no accidental text selection when
             swiping — both are dead giveaways of a web page. */
          .inbox-root button,
          .inbox-root [role="button"] {
            -webkit-tap-highlight-color: transparent;
            -webkit-touch-callout: none;
            user-select: none;
          }
          /* Message text stays selectable so customers' details can be copied. */
          .inbox-messages, .inbox-messages * { user-select: text; }

          /* Apple's minimum comfortable target is 44px; several controls were
             under 30px and hard to hit accurately. */
          .inbox-root button { min-height: 36px; }
          .inbox-composer button { min-height: 40px; }

          /* The reply box grows with content instead of scrolling in a 2-line
             window, which is how native keyboards behave. */
          .inbox-composer textarea {
            max-height: 40dvh;
            line-height: 1.4;
          }

          /* Conversation rows: full-width tap target with a pressed state. */
          .inbox-col-list button:active { background: var(--peach) !important; }

          /* Contact panel opens as a full sheet rather than a cramped column. */
          .inbox-pane-contact .inbox-col-contact {
            padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
          }
        }
        /* Desktop / tablet: the tools sit inline on the right as before */
        @media (min-width: 768px) {
          .inbox-header-tools { display: flex; align-items: center; gap: 10px; }
        }
        /* Narrow desktop windows: tighten so nothing falls off */
        @media (min-width: 768px) and (max-width: 1100px) {
          .inbox-thread-header { gap: 7px !important; padding: 10px 12px !important; }
          .inbox-header-tools { gap: 7px !important; }
        }
        @media (min-width: 768px) {
          .inbox-mobile-only { display: none !important; }
        }
      `}</style>
      {/* IncomingCallListener now lives in the admin layout, so calls ring on
          EVERY admin page — not only here. Mounting it twice would register two
          clients on the same credential. */}

      {/* Conversation action panels */}
      <style>{`
        @keyframes doaSlideIn { from { transform: translate(100%, -50%); } to { transform: translate(0, -50%); } }
        @keyframes typingDot { 0%, 60%, 100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @keyframes livePulse { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.6); } 50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(34,197,94,0); } }
        .ai-spark:hover .ai-tip { opacity: 1 !important; }
      `}</style>

      {/* Forward media to another contact */}
      {forwarding && (
        <div onClick={() => setForwarding(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Forward to…</h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'var(--canvas)', marginBottom: 16 }}>
              {forwarding.kind === 'video'
                ? <video src={forwarding.url} style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                : <img src={forwarding.url} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
              <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {forwarding.name || (forwarding.kind === 'video' ? 'Video' : 'Photo')}
              </span>
            </div>

            <input autoFocus value={forwardSearch}
              onChange={e => searchForwardTargets(e.target.value)}
              placeholder="Search contacts by name, email or phone…"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 12, boxSizing: 'border-box' }} />

            {forwardSearch.trim().length < 2 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 20 }}>Type at least 2 characters.</p>
            ) : forwardResults.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 20 }}>No contacts match.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {forwardResults.map(c => (
                  <button key={c.id} type="button" onClick={() => forwardTo(c)} disabled={forwardBusy}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name || 'No name'}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)' }}>{[c.email, c.phone].filter(Boolean).join(' · ')}</span>
                    </span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  </button>
                ))}
              </div>
            )}

            <button onClick={() => setForwarding(null)}
              style={{ width: '100%', marginTop: 16, padding: '10px 0', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Schedule a delivery */}
      {showSchedule && selected && (
        <div onClick={() => setShowSchedule(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 440, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Schedule delivery</h3>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Books it into the team calendar so every outlet can see the run{contact?.name ? `, for ${contact.name}` : ''}.
            </p>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Date</label>
            <input type="date" value={schedule.date}
              onChange={e => setSchedule({ ...schedule, date: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Time window</label>
            <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
              {['9am – 12pm', '12pm – 3pm', '3pm – 6pm', 'Anytime'].map(w => (
                <button key={w} type="button" onClick={() => setSchedule({ ...schedule, time_window: w })}
                  style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${schedule.time_window === w ? 'var(--coral)' : 'var(--border)'}`, background: schedule.time_window === w ? 'var(--peach)' : '#fff', color: schedule.time_window === w ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                  {w}
                </button>
              ))}
            </div>
            <input value={schedule.time_window} placeholder="Or type a custom window"
              onChange={e => setSchedule({ ...schedule, time_window: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Delivery address</label>
            <input value={schedule.address} placeholder="5 Clunes Avenue, Dallas VIC"
              onChange={e => setSchedule({ ...schedule, address: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

            {outletsForSchedule.length > 0 && (
              <>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Delivering from</label>
                <select value={schedule.location_id}
                  onChange={e => setSchedule({ ...schedule, location_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Any outlet</option>
                  {outletsForSchedule.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb}</option>)}
                </select>
              </>
            )}

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Notes for the team</label>
            <textarea value={schedule.notes} placeholder="Heavy — two people. Gate code 1234."
              onChange={e => setSchedule({ ...schedule, notes: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, minHeight: 64, resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <input type="checkbox" checked={schedule.notify}
                onChange={e => setSchedule({ ...schedule, notify: e.target.checked })}
                style={{ width: 17, height: 17, accentColor: 'var(--coral)' }} />
              <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Tell the customer the date and window</span>
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setShowSchedule(false)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={saveSchedule} disabled={!schedule.date || scheduling}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!schedule.date || scheduling) ? 0.6 : 1 }}>
                {scheduling ? 'Scheduling…' : 'Schedule delivery'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product search — look a product up and send its price or buy link */}
      {showProducts && selected && (
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '95vw', background: '#fff', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 32px rgba(0,0,0,0.10)', zIndex: 250, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Product search</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>Send a price or a buy link without leaving the chat.</p>
            </div>
            <button onClick={() => setShowProducts(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 4 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input autoFocus value={productQuery} onChange={e => setProductQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchProducts() }}
              placeholder="Search by name or SKU…"
              style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
            <button onClick={searchProducts} disabled={productSearching || !productQuery.trim()}
              style={{ padding: '10px 16px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {productSearching ? '…' : 'Search'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {productError && (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12.5, marginBottom: 12, lineHeight: 1.45 }}>
                {productError}
              </div>
            )}

            {products.length === 0 && !productSearching && !productError && (
              <p style={{ fontSize: 13.5, color: 'var(--slate)', textAlign: 'center', padding: 30 }}>
                {productQuery ? 'No products matched that search.' : 'Search your WooCommerce catalogue.'}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {products.map(p => {
                const onSale = p.on_sale && p.sale_price
                const price = onSale ? p.sale_price : (p.price || p.regular_price)
                const inStock = p.stock_status === 'instock'
                return (
                  <div key={p.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fff' }}>
                    <div style={{ display: 'flex', gap: 11, marginBottom: 10 }}>
                      {p.image
                        ? <img src={p.image} alt="" style={{ width: 54, height: 54, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border)' }} />
                        : <div style={{ width: 54, height: 54, borderRadius: 9, background: 'var(--canvas)', flexShrink: 0 }} />}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.35 }}>{p.name}</p>
                        <p style={{ margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>${price}</span>
                          {onSale && <span style={{ fontSize: 11.5, color: '#9ca3af', textDecoration: 'line-through' }}>${p.regular_price}</span>}
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: inStock ? '#dcfce7' : '#fee2e2', color: inStock ? '#15803d' : '#dc2626' }}>
                            {inStock ? (p.manage_stock && p.stock_quantity != null ? `${p.stock_quantity} in stock` : 'In stock') : 'Out of stock'}
                          </span>
                        </p>
                        {p.sku && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--slate)' }}>SKU: {p.sku}</p>}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => sendProductMessage(p, 'price')}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: productSent === `${p.id}-price` ? '#dcfce7' : 'var(--coral)', color: productSent === `${p.id}-price` ? '#15803d' : '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                        {productSent === `${p.id}-price` ? 'Sent ✓' : 'Send price'}
                      </button>
                      <button onClick={() => sendProductMessage(p, 'link')} disabled={!p.permalink}
                        title={p.permalink ? 'Send a link they can buy from' : 'No product URL available'}
                        style={{ flex: 1, padding: '7px 0', borderRadius: 8, background: productSent === `${p.id}-link` ? '#dcfce7' : 'var(--peach)', color: productSent === `${p.id}-link` ? '#15803d' : 'var(--coral)', border: '1px solid var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: p.permalink ? 'pointer' : 'not-allowed', opacity: p.permalink ? 1 : 0.5 }}>
                        {productSent === `${p.id}-link` ? 'Sent ✓' : 'Send link'}
                      </button>
                      <button onClick={() => sendProductMessage(p, 'both')} disabled={!p.permalink}
                        title="Send the price and a buy link together"
                        style={{ padding: '7px 12px', borderRadius: 8, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 700, cursor: p.permalink ? 'pointer' : 'not-allowed', opacity: p.permalink ? 1 : 0.5 }}>
                        Both
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Proof of Delivery panel */}
      {showPod && (
        <div onClick={() => setShowPod(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 460, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                {Icon.box(17)} Proof of Delivery
              </h2>
              <button type="button" onClick={() => setShowPod(false)}
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', marginBottom: 6 }}>Delivery photo(s)</label>
            <input type="file" accept="image/*,video/*" multiple
              onChange={e => setPodFiles(Array.from(e.target.files || []))}
              style={{ width: '100%', fontSize: 12.5, marginBottom: 6 }} />
            {podFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {podFiles.map((f, i) => (
                  <span key={i} style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 7, background: 'var(--peach)', color: 'var(--coral)' }}>{f.name}</span>
                ))}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', margin: '10px 0 6px' }}>Message to the customer</label>
            <textarea value={podNote} onChange={e => setPodNote(e.target.value)} rows={4}
              placeholder="Your order has been delivered. Attached is the proof of delivery — thank you!"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical' }} />

            <button type="button" onClick={sendProofOfDelivery} disabled={podSending}
              style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: podSending ? 'wait' : 'pointer' }}>
              {podSending ? 'Sending…' : 'Send proof of delivery'}
            </button>
            <p style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 9, lineHeight: 1.5 }}>
              Sent in the chat, texted to their mobile if we have one, and the delivery is marked as delivered.
            </p>
          </div>
        </div>
      )}

      {/* Delivery calendar slide-out */}
      {showDeliveryPanel && contact && (
        <DeliveryPanel
          companyId={companyId}
          contact={contact}
          onClose={() => setShowDeliveryPanel(false)}
          onSaved={(patch: any) => setContact((c: any) => ({ ...c, ...patch }))}
        />
      )}

      {showTimeline && contact && (
        <ContactTimeline contactId={contact.id} contactName={contact.name || contact.email || undefined}
          onClose={() => setShowTimeline(false)} />
      )}

      {showDialer && (
        <Dialer companyId={companyId} agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]}
          onClose={() => setShowDialer(false)} />
      )}

      {showCompose && companyId && (
        <ComposeMessage
          companyId={companyId}
          senderName={user?.user_metadata?.display_name || user?.email?.split('@')[0]}
          onClose={() => setShowCompose(false)}
          onStarted={(convId) => { setShowCompose(false); loadConversations(); }}
        />
      )}

      {/* Filter panel (Coax style) */}
      {showFilters && (
        <div onClick={() => setShowFilters(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 860, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 20, padding: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--coral)' }}>Filter</h2>
              <button type="button" onClick={() => setShowFilters(false)} title="Close" aria-label="Close filters"
                style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {/* Left: date range + sort */}
              <div>
                <div style={{ background: 'var(--canvas)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
                  <p style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Date Range</p>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', marginBottom: 5 }}>From</label>
                  <input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 14, boxSizing: 'border-box', background: '#fff' }} />
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', marginBottom: 5 }}>To</label>
                  <input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', background: '#fff' }} />
                </div>

                <div style={{ background: 'var(--canvas)', borderRadius: 14, padding: 18 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
                    <input type="checkbox" checked={filters.oldestFirst}
                      onChange={e => setFilters({ ...filters, oldestFirst: e.target.checked })}
                      style={{ width: 18, height: 18, accentColor: 'var(--coral)' }} />
                    <span style={{ fontSize: 14, color: 'var(--ink)' }}>Order by oldest to newest</span>
                  </label>
                </div>
              </div>

              {/* Right: channel / assigned / source */}
              <div style={{ background: 'var(--canvas)', borderRadius: 14, padding: 18 }}>
                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>Channel</label>
                <select value={filters.channel} onChange={e => setFilters({ ...filters, channel: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 16, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Select channel</option>
                  <option value="chat">Live chat</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="instagram">Instagram</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>

                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>Assigned user</label>
                <select value={filters.assignedTo} onChange={e => setFilters({ ...filters, assignedTo: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 16, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Select an assigned user</option>
                  <option value="__unassigned">Unassigned</option>
                  {teamMembers.map((t: any) => (
                    <option key={t.user_id || t.id} value={t.user_id || t.id}>{t.name || t.email}</option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>Source</label>
                <select value={filters.source} onChange={e => setFilters({ ...filters, source: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Select source</option>
                  <option value="chat">Live chat enquiry</option>
                  <option value="order">Order placed</option>
                  <option value="cart">Abandoned cart</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button type="button" onClick={() => setShowFilters(false)}
                style={{ padding: '12px 34px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Apply</button>
              <button type="button" onClick={resetFilters}
                style={{ padding: '12px 30px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Right-click menu on a conversation */}
      {ctxMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: Math.min(ctxMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 240), left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 210), width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.16)', zIndex: 500, overflow: 'hidden', padding: '4px 0' }}>
          {([
            ['Mark as read', <svg key="r" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, () => markRead(ctxMenu.conv)],
            ['Open in new tab', <svg key="o" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>, () => window.open(`/admin/inbox?conversation=${ctxMenu.conv.id}`, '_blank')],
            ['Copy link', <svg key="c" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, () => copyConvLink(ctxMenu.conv)],
            ['Close enquiry', <svg key="x" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>, () => closeConv(ctxMenu.conv)],
          ] as any[]).map(([label, icon, fn]: any) => (
            <button key={label} type="button" onClick={() => { fn(); setCtxMenu(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--canvas)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
              <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{icon}</span>{label}
            </button>
          ))}

          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
          <div style={{ padding: '4px 14px 6px' }}>
            <p style={{ margin: '0 0 5px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Snooze
            </p>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1, 4, 24].map(h => (
                <button key={h} type="button" onClick={() => { snoozeConv(ctxMenu.conv, h); setCtxMenu(null) }}
                  style={{ flex: 1, padding: '5px 0', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>
                  {h === 24 ? '1d' : `${h}h`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Charge a saved card */}
      {showChargeCard && selected && (
        <div onClick={() => setShowChargeCard(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 380, maxWidth: '92vw', background: '#fff', borderRadius: 16, padding: 22 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Charge saved card</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)' }}>Charges the customer&rsquo;s card on file. They won&rsquo;t need to do anything.</p>

            {savedCards.length === 0 ? (
              <>
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)', marginBottom: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
                    No saved card for this customer yet. Use <strong>Save Card</strong> to send them a secure Stripe link first.
                  </p>
                </div>
                <button type="button" onClick={() => { setShowChargeCard(false); saveCard() }}
                  style={{ width: '100%', padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Send &ldquo;Save Card&rdquo; link
                </button>
              </>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Card</label>
                <select value={chargeCardId} onChange={e => setChargeCardId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }}>
                  {savedCards.map(c => (
                    <option key={c.id} value={c.id}>
                      {(c.brand || 'card').toUpperCase()} •••• {c.last4} — expires {String(c.exp_month).padStart(2, '0')}/{c.exp_year}
                    </option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Amount (AUD)</label>
                <input type="number" min="1" step="0.01" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)}
                  placeholder="49.95"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, boxSizing: 'border-box' }} />

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>What&rsquo;s this for?</label>
                <input value={chargeDesc} onChange={e => setChargeDesc(e.target.value)}
                  placeholder="Replacement part"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setShowChargeCard(false)}
                    style={{ flex: 1, padding: '11px 0', borderRadius: 10, background: '#fff', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button type="button" onClick={chargeCard} disabled={!chargeAmount || charging}
                    style={{ flex: 2, padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (!chargeAmount || charging) ? 0.6 : 1 }}>
                    {charging ? 'Charging…' : `Charge $${chargeAmount || '0'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showDoa && selected && companyId && (
        <DoaPanel
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id}
          contact={contact}
          channel={['widget', 'chat'].includes(activeChannel) ? null : activeChannel}
          channelLabel={['widget', 'chat'].includes(activeChannel) ? null : (CHANNEL_NAME[activeChannel] || activeChannel)}
          onDeliver={deliverToCustomer}
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
          channel={['widget', 'chat'].includes(activeChannel) ? null : activeChannel}
          channelLabel={['widget', 'chat'].includes(activeChannel) ? null : (CHANNEL_NAME[activeChannel] || activeChannel)}
          onDeliver={deliverToCustomer}
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
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 7 }}>{Icon.media(16)} Send from gallery</h2>
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
          {conversations.filter(c => c.is_unread && !['closed','resolved'].includes(c.status)).length > 0 && (
            <span style={{ marginTop: 10, fontSize: 10, fontWeight: 700, background: 'var(--coral)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {conversations.filter(c => c.is_unread && !['closed','resolved'].includes(c.status)).length}
            </span>
          )}
        </div>
      ) : (
      <div className="inbox-col-list" style={{ width: 300, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: '#fff', position: 'relative' }}>
        {/* Floating compose button — start a new outbound message/call */}
        <button type="button" onClick={() => setShowCompose(true)} title="New message"
          style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 20, width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'var(--coral)', color: '#fff', cursor: 'pointer', boxShadow: '0 6px 18px rgba(255,122,107,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Inbox</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', padding: '2px 8px', borderRadius: 20 }}>
                {conversations.filter(c => c.is_unread && !['closed','resolved'].includes(c.status)).length} unread
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
          <div style={{ position: 'relative' }}>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search conversations…"
              style={{ ...inp, background: 'var(--canvas)', paddingRight: searchTerm ? 34 : undefined }} />
            {searchTerm && (
              <button type="button" onClick={() => { setSearchTerm(''); setSearchScope('all') }}
                title="Clear search"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#e5e7eb', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          {/* Scope pills — refine what the search looks at. Shown while typing. */}
          {searchTerm.trim() && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {([
                ['all', 'All'], ['contact', 'Contact'], ['messages', 'Messages'],
                ['activity', 'Activity & Marketing'], ['tasks', 'Tasks'], ['notes', 'Notes'],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setSearchScope(key)}
                  style={{
                    padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    border: '1px solid ' + (searchScope === key ? '#2563eb' : 'var(--border)'),
                    background: searchScope === key ? '#2563eb' : '#fff',
                    color: searchScope === key ? '#fff' : 'var(--slate)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Location filter — scopes the whole inbox to one outlet. Only shown
              when the business actually has more than one location. */}
          {outlets.length > 1 && (
            <div style={{ position: 'relative', marginTop: 10 }}>
              {/* Map-pin icon sits inside the control so the select shows a real
                  SVG rather than an emoji glyph that renders differently per OS. */}
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', color: locationFilter !== 'all' ? 'var(--coral)' : 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)}
                style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 10, border: '1px solid var(--border)', background: locationFilter !== 'all' ? 'var(--peach)' : 'var(--canvas)', fontSize: 13, fontWeight: 600, color: locationFilter !== 'all' ? 'var(--coral)' : 'var(--ink)', cursor: 'pointer', appearance: 'none' }}>
                <option value="all">All locations</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>
                ))}
              </select>
            </div>
          )}

          {/* Assignment tabs — a horizontally scrollable strip (Coax style) so
              extra views can be added without wrapping the row. */}
          <div className="inbox-assign-tabs" style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
            {([
              ['all', 'All'],
              ['mine', 'Assigned to me'],
              ['unassigned', 'Unassigned'],
            ] as const).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setAssignFilter(key)}
                style={{
                  flexShrink: 0, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid ' + (assignFilter === key ? 'var(--coral)' : 'var(--border)'),
                  background: assignFilter === key ? 'var(--peach)' : '#fff',
                  color: assignFilter === key ? 'var(--coral)' : 'var(--slate)',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', transition: 'all 0.12s',
                }}>
                {label}
              </button>
            ))}
          </div>
          {/* Open / Closed tabs (Coax style) + filter */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <div style={{ flex: 1, display: 'flex', background: 'var(--canvas)', borderRadius: 10, padding: 3 }}>
              {(['open', 'closed'] as const).map(s => (
                <button key={s} type="button" onClick={() => { if (s !== statusFilter) { setConversations([]); setConvLimit(50); setStatusFilter(s) } }}
                  style={{ flex: 1, padding: '7px 4px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize', background: statusFilter === s ? '#fff' : 'transparent', color: statusFilter === s ? 'var(--ink)' : 'var(--slate)', boxShadow: statusFilter === s ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.12s' }}>
                  {s}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowFilters(true)} title="Filter"
              style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${activeFilterCount > 0 ? 'var(--coral)' : 'var(--border)'}`, background: activeFilterCount > 0 ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: activeFilterCount > 0 ? 'var(--coral)' : 'var(--slate)', position: 'relative', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {activeFilterCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--coral)', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{activeFilterCount}</span>
              )}
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredConvs.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No conversations yet</div>
          )}
          {filteredConvs.map(conv => {
            // Customer name first — the source is a tag, not the headline.
            const c: any = conv
            const contact = c.contacts || {}
            const displayName =
              contact.name ||
              contact.email ||
              contact.phone ||
              c.sms_number ||
              (c.subject && !/^(abandoned cart|order #)/i.test(c.subject) ? c.subject : null) ||
              'Visitor'

            // Where is this conversation happening NOW?
            const subj = (c.subject || '').toLowerCase()
            const ch = String(c.channel || '').toLowerCase()
            let source: { label: string; bg: string; fg: string }
            // Set when the top tag is the source (Website) and the cart state
            // needs to show alongside it.
            let cartSecond: any = null
            // A live non-web channel wins over the subject-derived tag. Someone
            // who began as an order/cart but is now texting should read "SMS",
            // not keep an "Order Placed" badge forever.
            const CHANNEL_BADGE: Record<string, any> = {
              sms:       { label: 'SMS', bg: '#fef3c7', fg: '#b45309' },
              email:     { label: 'Email', bg: '#e0e7ff', fg: '#4338ca' },
              instagram: { label: 'Instagram', bg: '#fce7f3', fg: '#be185d' },
              facebook:  { label: 'Messenger', bg: '#dbeafe', fg: '#1d4ed8' },
              messenger: { label: 'Messenger', bg: '#dbeafe', fg: '#1d4ed8' },
              whatsapp:  { label: 'WhatsApp', bg: '#dcfce7', fg: '#15803d' },
            }
            if (CHANNEL_BADGE[ch]) {
              source = CHANNEL_BADGE[ch]
            } else if (subj.startsWith('abandoned cart') && !(c as any).order_status && (c as any).cart_status !== 'recovered') {
              // Only an UNrecovered cart shows the "Abandoned Cart" badge.
              // Once it's recovered (an order was placed), the conversation gets
              // an order_status and should read as an order below — otherwise it
              // wrongly stayed "Abandoned Cart" forever after the sale.
              // The top tag is the SOURCE the enquiry came from (the website),
              // with the cart state shown as the second badge.
              source = { label: 'Website', bg: '#e0e7ff', fg: '#4338ca' }
              cartSecond = { label: 'Abandoned Cart', bg: '#fee2e2', fg: '#dc2626' }
            } else if (subj.startsWith('order #') || (c as any).order_status) {
              // Read the ACTUAL order status. This used to say "Order Placed" for
              // every order conversation — including failed payments, which is
              // exactly backwards: those are the ones needing attention.
              const os = String((c as any).order_status || '').toLowerCase()
              const ORDER_BADGE: Record<string, any> = {
                failed:     { label: 'Payment Failed', bg: '#fee2e2', fg: '#dc2626' },
                cancelled:  { label: 'Order Cancelled', bg: '#fee2e2', fg: '#dc2626' },
                refunded:   { label: 'Order Refunded', bg: '#fef3c7', fg: '#b45309' },
                'on-hold':  { label: 'Order On Hold', bg: '#fef3c7', fg: '#b45309' },
                pending:    { label: 'Payment Pending', bg: '#fef3c7', fg: '#b45309' },
                completed:  { label: 'Order Completed', bg: '#dcfce7', fg: '#15803d' },
                processing: { label: 'Order Placed', bg: '#dcfce7', fg: '#15803d' },
              }
              source = ORDER_BADGE[os] || { label: 'Order Placed', bg: '#dcfce7', fg: '#15803d' }
            } else {
              source = { label: 'Live Chat Enquiry', bg: '#dcfce7', fg: '#15803d' }
            }
            const isLiveChat = source.label === 'Live Chat Enquiry'

            // Secondary badge: when the primary badge is the CHANNEL (SMS, email,
            // Messenger…), also surface the order status if this customer has an
            // order — so an SMS conversation with a placed order shows BOTH
            // "SMS" and "Order Placed" rather than hiding the sale.
            let secondBadge: any = cartSecond
            if (CHANNEL_BADGE[ch]) {
              const os2 = String((c as any).order_status || '').toLowerCase()
              const ORDER_BADGE2: Record<string, any> = {
                failed:     { label: 'Payment Failed', bg: '#fee2e2', fg: '#dc2626' },
                cancelled:  { label: 'Order Cancelled', bg: '#fee2e2', fg: '#dc2626' },
                refunded:   { label: 'Order Refunded', bg: '#fef3c7', fg: '#b45309' },
                'on-hold':  { label: 'Order On Hold', bg: '#fef3c7', fg: '#b45309' },
                pending:    { label: 'Payment Pending', bg: '#fef3c7', fg: '#b45309' },
                completed:  { label: 'Order Completed', bg: '#dcfce7', fg: '#15803d' },
                processing: { label: 'Order Placed', bg: '#dcfce7', fg: '#15803d' },
              }
              if (os2 && ORDER_BADGE2[os2]) secondBadge = ORDER_BADGE2[os2]
              else if (subj.startsWith('abandoned cart') && (c as any).cart_status !== 'recovered' && !os2) secondBadge = { label: 'Abandoned Cart', bg: '#fee2e2', fg: '#dc2626' }
            }

            const accent = companyInfo?.accent_color || 'var(--coral)'
            const unread = conv.is_unread && selected?.id !== conv.id

            // How long has the customer been waiting for a reply? Only flag a
            // conversation as overdue when it's genuinely unanswered — i.e. it's
            // UNREAD (the customer's latest message hasn't been actioned) AND the
            // last activity is old. The old code read last_customer_message_at,
            // which is never kept current, so it showed stale "129 hours" even
            // right after a live back-and-forth.
            let waitingHours = 0
            const lastAt = parseTs(conv.last_message_at)
            if (lastAt && conv.status !== 'closed' && conv.status !== 'resolved' && (c as any).is_unread) {
              waitingHours = (Date.now() - lastAt.getTime()) / 3600000
            }
            const isOverdue = waitingHours >= 3

            return (
            <button key={conv.id} type="button" onClick={() => selectConversation(conv)}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', paddingLeft: unread ? 11 : 14, border: 'none', borderLeft: unread ? `3px solid ${accent}` : '3px solid transparent', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === conv.id ? 'var(--peach)' : unread ? '#fff6f4' : '#fff', transition: 'background 0.1s' }}>
              {/* Location label — only shown when viewing All locations, so the
                  agent can see which outlet each enquiry belongs to (Coax-style).
                  Live-chat widget conversations show "Live Chat". */}
              {locationFilter === 'all' && (() => {
                const locId = (conv as any).assigned_location_id || (conv as any).location_id
                const loc = outlets.find((o: any) => o.id === locId)
                // An abandoned cart came from the store, not the chat widget —
                // labelling it "Live Chat" was misleading.
                const isCart = String(conv.subject || '').toLowerCase().startsWith('abandoned cart')
                const isWidget = conv.channel === 'chat' || conv.channel === 'widget' || conv.channel === 'live_chat'
                const label = loc ? (loc.label || loc.suburb)
                  : isCart ? 'Website'
                  : isWidget ? 'Live Chat'
                  : null
                if (!label) return null
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {label}
                  </div>
                )
              })()}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent, flexShrink: 0 }} />}
                  <span style={{ fontSize: 13.5, fontWeight: conv.is_unread ? 700 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
                  {isOverdue && (
                    <span className="overdue-badge" style={{ position: 'relative', display: 'inline-flex', color: '#f59e0b' }}>
                      {/* Gentle clock icon (amber, not a red alert) — a nudge, not
                          an error about the customer. */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                      <span className="overdue-tip">
                        Waiting {Math.floor(waitingHours)}h for a reply — reply or close this conversation.
                      </span>
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, color: '#9ca3af', fontStyle: 'italic' }}>{listTime(conv.last_message_at)}</span>
                </div>
              </div>

              {/* Source tag(s) — channel plus order status when both apply */}
              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, marginBottom: 5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: source.bg, color: source.fg }}>
                  {isLiveChat && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'livePulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
                  )}
                  {source.label}
                </span>
                {secondBadge && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', padding: '2px 7px', borderRadius: 5, background: secondBadge.bg, color: secondBadge.fg }}>
                    {secondBadge.label}
                  </span>
                )}
              </span>

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
            )
          })}
          {hasMoreConvs && (
            <button type="button" onClick={() => setConvLimit(l => l + 50)}
              style={{ display: 'block', width: '100%', padding: '12px', border: 'none', borderTop: '1px solid var(--border)', background: '#fff', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Load more conversations
            </button>
          )}
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
            <div className="inbox-thread-header" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Mobile: back to conversation list */}
              <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('list')} title="Back"
                style={{ display: 'none', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', order: -2 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              {/* Contact avatar — real profile photo (from Messenger/Instagram)
                  when we have it, initials otherwise. */}
              {(() => {
                const nm = contact?.name || selected.subject || 'Visitor'
                const av = (contact as any)?.avatar_url
                return av ? (
                  <img src={av} alt={nm} referrerPolicy="no-referrer"
                    style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                ) : (
                  <span style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                    {nm.charAt(0).toUpperCase()}
                  </span>
                )
              })()}
              <div className="inbox-header-name" style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {contact?.name || selected.subject || 'Visitor'}
                  </span>
                  {contact?.id && (
                    <a href={`/admin/customers/profile?id=${contact.id}`}
                      title="Open full customer profile"
                      style={{ display: 'inline-flex', alignItems: 'center', color: '#2563eb', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
                    </a>
                  )}
                  {/* Sentiment badge */}
                  {(selected as any).sentiment && (
                    <span title={`${(selected as any).sentiment} experience`}
                      style={{ display: 'flex', alignItems: 'center', color: SENTIMENT_COLOR[(selected as any).sentiment] || 'var(--slate)' }}>
                      {(SENTIMENT_ICON[(selected as any).sentiment] || Icon.meh)(15)}
                    </span>
                  )}
                </p>
                {/* Live chat: where they are on the site. Any other channel:
                    name the channel instead, so the agent knows a reply goes
                    out by SMS/email rather than into a web widget. */}
                {isWebChat
                  ? (isOnPageNow && selected.page_title && <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>On: {selected.page_title}</p>)
                  : (() => {
                      // "Last activity 5m ago", Coax-style, from the customer's
                      // most recent message on the conversation.
                      const la = (selected as any).last_customer_activity_at || (selected as any).last_message_at
                      const rel = la ? timeAgo(la) : null
                      return rel
                        ? <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Last activity {rel === 'now' ? 'just now' : `${rel} ago`}</p>
                        : <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>via {CHANNEL_NAME[activeChannel] || activeChannel}</p>
                    })()}
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


              {/* Tools strip. On phones this becomes a single horizontally
                  scrollable row under the customer's name — the native chat-app
                  pattern — instead of nine buttons wrapping into ragged rows. */}
              <div className="inbox-header-tools">
              {/* AI on/off for this conversation */}
              <button type="button"
                onClick={async () => {
                  if (!selected) return
                  // null = follow the company default; false = silenced here.
                  const next = (selected as any).ai_enabled === false ? null : false
                  await (supabase as any).from('conversations').update({ ai_enabled: next }).eq('id', selected.id)
                  setSelected({ ...selected, ai_enabled: next } as any)
                  showToast(next === false ? 'AI paused for this chat' : 'AI following your default setting')
                }}
                title={(selected as any).ai_enabled === false ? 'AI is paused here — click to re-enable' : 'AI may reply here — click to pause it'}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: `1px solid ${(selected as any).ai_enabled === false ? 'var(--border)' : '#8b5cf6'}`,
                  background: (selected as any).ai_enabled === false ? '#fff' : '#f5f3ff',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: (selected as any).ai_enabled === false ? '#c0c4cc' : '#8b5cf6',
                  position: 'relative',
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/></svg>
                {(selected as any).ai_enabled === false && (
                  <span style={{ position: 'absolute', width: 20, height: 1.6, background: '#dc2626', transform: 'rotate(-45deg)', borderRadius: 1 }} />
                )}
              </button>

              {/* Product search */}
              <button type="button" onClick={() => setShowProducts(true)} title="Product search — send a price or buy link"
                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${showProducts ? 'var(--coral)' : 'var(--border)'}`, background: showProducts ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: showProducts ? 'var(--coral)' : 'var(--slate)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </button>

              {/* Move or view enquiries across outlets */}
              {outlets.length > 0 && (
                <div ref={moveMenuRef} style={{ position: 'relative' }}>
                  <button type="button" onClick={() => setShowMoveMenu(v => !v)} title="Move Or View Enquiries"
                    style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${showMoveMenu ? 'var(--coral)' : 'var(--border)'}`, background: showMoveMenu ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: showMoveMenu ? 'var(--coral)' : 'var(--slate)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </button>
                  {showMoveMenu && (
                    <div style={{ position: 'absolute', top: '120%', right: 0, width: 260, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 36px rgba(0,0,0,0.16)', zIndex: 80, padding: 8 }}>
                      <p style={{ margin: '2px 6px 8px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Move or view enquiries</p>
                      {outlets.map(o => {
                        const isCurrent = (selected as any).assigned_location_id === o.id
                        return (
                          <button key={o.id} type="button" onClick={() => !isCurrent && moveToOutlet(o)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none', background: isCurrent ? 'var(--peach)' : 'var(--canvas)', cursor: isCurrent ? 'default' : 'pointer', marginBottom: 5 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label || o.suburb}</span>
                            </span>
                            {isCurrent && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--coral)', border: '1px solid var(--coral)', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>Current</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Dialer — green and keypad-shaped, so it reads as a dialler at a
                  glance rather than a generic grey icon. */}
              <button type="button" onClick={() => setShowDialer(true)} title="Dialler — call any number"
                style={{ height: 36, padding: '0 11px', borderRadius: 10, border: '1.5px solid #bbf7d0', background: 'radial-gradient(circle at 50% 30%, #f0fdf4 0%, #dcfce7 100%)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: '#065f46', boxShadow: '0 1px 3px rgba(6,95,70,0.12)' }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <circle cx="5" cy="4.5" r="2"/><circle cx="12" cy="4.5" r="2"/><circle cx="19" cy="4.5" r="2"/>
                  <circle cx="5" cy="11.5" r="2"/><circle cx="12" cy="11.5" r="2"/><circle cx="19" cy="11.5" r="2"/>
                  <circle cx="5" cy="18.5" r="2"/><circle cx="12" cy="18.5" r="2"/><circle cx="19" cy="18.5" r="2"/>
                </svg>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>Dial</span>
              </button>

              {/* Search messages toggle */}
              <button type="button" onClick={() => { setShowMsgSearch(v => !v); setMsgSearch('') }} title="Search messages"
                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: showMsgSearch ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', order: -1 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
              {/* Sentiment picker */}
              <div style={{ display: 'flex', gap: 2 }}>
                {(['positive', 'neutral', 'negative'] as const).map(s => {
                  const active = (selected as any).sentiment === s
                  return (
                    <button key={s} type="button" onClick={() => setSentiment(s)} title={`Mark ${s}`}
                      style={{ width: 30, height: 30, borderRadius: 8, border: active ? `1.5px solid ${SENTIMENT_COLOR[s]}` : '1px solid var(--border)', background: active ? 'var(--peach)' : '#fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? SENTIMENT_COLOR[s] : 'var(--slate)' }}>
                      {SENTIMENT_ICON[s](16)}
                    </button>
                  )
                })}
              </div>

              {/* Status pill */}
              <div style={{ position: 'relative' }}>
                <select value={selected.status} onChange={e => setStatus(e.target.value)}
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 8, border: 'none', background: STATUS_COLOR[selected.status]?.bg || '#f3f4f6', color: STATUS_COLOR[selected.status]?.color || '#6b7280', cursor: 'pointer', appearance: 'none' }}>
                  {Object.entries(STATUS_COLOR).map(([k, v]) => <option key={k} value={k}>{v.color && k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                </select>
              </div>
              </div>
              {/* Assign and ⋯ are TRUE siblings of the scrolling tools strip (not
                  inside it) — the strip's overflow-x/mask was clipping their taps
                  and dropdown menus when they lived inside it. */}
              {/* Assign button */}
              <div style={{ position: 'relative' }} data-assign-menu>
                <button type="button" onClick={() => { setShowAssignMenu(v => !v); setAssignSearch('') }}
                  style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: 'var(--ink)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {selected.assigned_name ? <>{Icon.person(13)}{selected.assigned_name}</> : '+ Assign'}
                  </span>
                </button>
                {showAssignMenu && (
                  <div style={{ position: 'absolute', top: '110%', right: 0, width: 240, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
                    <p style={{ margin: 0, padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Assign User</p>
                    {/* Search box with a clear (×) on the right */}
                    <div style={{ padding: '0 10px 8px' }}>
                      <div style={{ position: 'relative' }}>
                        <input autoFocus value={assignSearch} onChange={e => setAssignSearch(e.target.value)}
                          placeholder="Search users…"
                          style={{ width: '100%', padding: '7px 26px 7px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }} />
                        {assignSearch && (
                          <button type="button" onClick={() => setAssignSearch('')}
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    <button type="button" onClick={() => assignTo(null)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>
                      Unassign
                    </button>
                    {teamMembers.filter((m: any) => !assignSearch || (m.name || '').toLowerCase().includes(assignSearch.toLowerCase())).map(m => (
                      <button key={m.id} type="button" onClick={() => assignTo(m)}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: selected.assigned_to === m.user_id ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                          {m.name?.charAt(0).toUpperCase()}
                        </span>
                        {m.name}
                        {selected.assigned_to === m.user_id && ' ✓'}
                      </button>
                    ))}
                    {teamMembers.filter((m: any) => !assignSearch || (m.name || '').toLowerCase().includes(assignSearch.toLowerCase())).length === 0 && (
                      <p style={{ margin: 0, padding: '10px 14px', fontSize: 12, color: '#9ca3af' }}>No users match.</p>
                    )}
                    </div>
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
            {/* NOTE: the "AI saved: …" banner used to appear every time you
                opened a conversation, because detection re-runs on each select.
                It was pure noise. The sparkle beside each AI-filled contact
                field (with its "Auto added by Colvy AI" tooltip) already says
                the same thing, once, where it matters. */}

            {/* Page history banner — LIVE CHAT ONLY.
                "Currently on: <page>" claims the customer is browsing the site
                right now. That's only true for the on-site widget. For an SMS
                or email thread it's stale data from a previous web visit, and
                it misleads the agent into thinking someone is live on the page
                when they're actually texting. */}
            {selected.page_url && isWebChat && isOnPageNow && (
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
            <div ref={messagesScrollRef} className="inbox-messages" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, scrollBehavior: 'auto' }}>
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
                const first = list[0]
                const enquiryName = contact?.name || contact?.email || contact?.phone || 'a customer'
                const SRC: Record<string, string> = {
                  sms: 'SMS Enquiry', email: 'Email Enquiry', instagram: 'Instagram Enquiry',
                  facebook: 'Messenger Enquiry', messenger: 'Messenger Enquiry',
                  whatsapp: 'WhatsApp Enquiry', phone: 'Phone Call',
                }
                const subj = (selected.subject || '').toLowerCase()
                const enquiryKind = subj.startsWith('abandoned cart') ? 'Abandoned Cart'
                  : subj.startsWith('order #') ? 'Order Placed'
                  : (SRC[(selected.channel || '').toLowerCase()] || 'Live Chat Enquiry')

                const header = (
                  <div key="enquiry-header" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                      New {enquiryKind} from {enquiryName}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                )

                return [header, ...mergeEvents(list, events).map((item: any) => {
                if (item.__event) {
                  // Inline timeline event: "Conversation assigned to X",
                  // "Now chatting through SMS", "Enquiry moved to …"
                  const ev = item
                  const isPageView = ev.event_type === 'page_view'
                  return (
                    <div key={`ev-${ev.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                      <div style={{ flex: 1, height: 1, background: '#eceef0' }} />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: isPageView ? '#0284c7' : '#9ca3af', whiteSpace: 'nowrap', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {isPageView ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        )}
                        {ev.detail || ev.event_type}
                        {ev.created_at && (
                          <span style={{ color: '#c2c6cb', fontWeight: 500 }}> · {fmtTime(ev.created_at)}</span>
                        )}
                      </span>
                      <div style={{ flex: 1, height: 1, background: '#eceef0' }} />
                    </div>
                  )
                }
                const msg = item
                const thisDay = dayLabel(msg.created_at)
                const showDivider = thisDay && thisDay !== lastDay
                if (thisDay) lastDay = thisDay
                const isAgent = msg.sender_type === 'agent'
                const isSystem = msg.sender_type === 'system'
                const isInternal = !!(msg as any).is_internal
                const dateDivider = showDivider ? (
                  <div key={`div-${msg.id}`} style={{ textAlign: 'center', margin: '10px 0 4px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20 }}>{thisDay}</span>
                  </div>
                ) : null
                // Internal staff-only note — sits inline in the timeline so the
                // team reads it in sequence, but is visually unmistakable
                // (amber, dashed, italic, "Only your team can see this") so it's
                // never confused with something the customer received.
                if (isInternal) return (
                  <div key={msg.id}>
                    {dateDivider}
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0' }}>
                      <div style={{ maxWidth: '86%', width: '100%', background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: 12, padding: '10px 13px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg>
                          Internal note · only your team can see this
                        </div>
                        <p style={{ margin: 0, fontSize: 13.5, color: '#78350f', fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {renderWithMentions(msg.content)}
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: 10.5, color: '#b08968', fontStyle: 'italic' }}>
                          {(msg as any).sender_name || 'Team'} · {fmtTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                )
                // A connected call renders as a full Coax-style card — AI
                // summary, action items, recording player, transcript — not a
                // grey one-line pill.
                if (isSystem && (msg as any).metadata?.call_event && (msg as any).metadata?.call_id) return (
                  <div key={msg.id}>
                    {dateDivider}
                    <CallCard callId={(msg as any).metadata.call_id} meta={(msg as any).metadata} timestamp={msg.created_at} />
                  </div>
                )
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

                // Email messages render as a full Coax-style card (From/To/Cc,
                // subject, formatted body, quoted history, attachments) rather
                // than a chat bubble of stripped text.
                if (String((msg as any).delivery_channel || '').toLowerCase() === 'email'
                    && ((msg as any).email_html || (msg as any).email_from || (msg as any).email_subject)) {
                  return (
                    <div key={msg.id}>
                      {dateDivider}
                      <EmailMessage msg={msg} agentColor={companyInfo?.accent_color} />
                      <p style={{ textAlign: isAgent ? 'right' : 'left', fontSize: 10.5, color: '#9ca3af', margin: '2px 12px 0' }}>
                        {fmtReceipt(msg.created_at, isAgent, 'email')}
                      </p>
                    </div>
                  )
                }

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
                        {/* Instagram story reply — show the story they replied
                            to (thumbnail) above their message, like Coax. */}
                        {(msg as any).metadata?.story_reply && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: 6, borderRadius: 8, background: isAgent ? 'rgba(255,255,255,0.15)' : 'var(--canvas)', border: isAgent ? 'none' : '1px solid var(--border)' }}>
                            {(msg as any).metadata.story_reply.story_url ? (
                              /\.(mp4|mov|webm)(\?|$)/i.test((msg as any).metadata.story_reply.story_url)
                                ? <video src={(msg as any).metadata.story_reply.story_url} style={{ width: 34, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                                : <img src={(msg as any).metadata.story_reply.story_url} alt="story" style={{ width: 34, height: 48, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <span style={{ width: 34, height: 48, borderRadius: 6, background: 'linear-gradient(135deg,#F47133,#BC3081)', flexShrink: 0 }} />
                            )}
                            <span style={{ fontSize: 11, opacity: 0.85, fontStyle: 'italic' }}>Replied to your story</span>
                          </div>
                        )}

                        {/* Attachments */}
                        {atts.map((a: any, ai: number) => (
                          <div key={ai} style={{ marginBottom: a.kind !== 'file' && msg.content ? 6 : 0, position: 'relative' }}
                            className="chat-att">
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
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{Icon.attach(12)}{a.name}</span>
                              </a>
                            )}

                            {/* Forward this media to another contact — on the image
                                itself, not just in the shared-media panel. */}
                            {(a.kind === 'image' || a.kind === 'video') && (
                              <button type="button"
                                className="chat-att-fwd"
                                onClick={e => { e.stopPropagation(); setForwarding(a); setForwardSearch(''); setForwardResults([]) }}
                                title="Forward to another contact"
                                style={{ position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: 7, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)', opacity: 0, transition: 'opacity 0.12s' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                              </button>
                            )}
                          </div>
                        ))}
                        {(msg as any).metadata?.review_request ? (
                          <div style={{ padding: '4px 2px 2px' }}>
                            {/* Review-request card, shown to the agent — mirrors
                                what the customer received. Updates to "completed"
                                once the customer leaves the review. */}
                            {(() => {
                              const completed = !!(msg as any).metadata?.review_completed
                              const rating = (msg as any).metadata?.review_rating || 0
                              const clicks = (msg as any).metadata?.review_clicks || 0
                              return (
                                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '14px 16px', maxWidth: 300 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                      <span style={{ width: 26, height: 26, borderRadius: 13, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>⭐</span>
                                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{completed ? 'Review Left' : 'Review Request Sent'}</span>
                                    </div>
                                    {clicks > 0 && !completed && (
                                      <span style={{ fontSize: 10.5, fontWeight: 700, background: 'rgba(255,255,255,0.25)', padding: '2px 7px', borderRadius: 20 }}>{clicks} click{clicks === 1 ? '' : 's'}</span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', margin: '6px 0 2px' }}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                      <span key={s} style={{ fontSize: 22, color: completed && s <= rating ? '#ffd25a' : 'rgba(255,255,255,0.45)' }}>★</span>
                                    ))}
                                  </div>
                                  {completed && rating > 0 && (
                                    <p style={{ margin: '4px 0 0', fontSize: 11, textAlign: 'center', opacity: 0.9 }}>Customer left {rating} star{rating === 1 ? '' : 's'}</p>
                                  )}
                                </div>
                              )
                            })()}
                            {/* The message text (with the /m/ link) below the card. */}
                            <div style={{ marginTop: 8, fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{msg.content}</div>
                          </div>
                        ) : (
                          msg.content && <div style={{ padding: atts.length && atts[0].kind !== 'file' ? '4px 10px 6px' : 0 }}>{msg.content}</div>
                        )}
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

                      {/* Timestamp + channel + read receipt — Coax style:
                          "Received 3:42 PM | 29 May | Facebook   Read by: SG" */}
                      <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#8a8f98', textAlign: isAgent ? 'right' : 'left', display: 'flex', gap: 6, alignItems: 'center', justifyContent: isAgent ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                        <span style={{ fontStyle: 'italic' }}>
                          {fmtReceipt(msg.created_at, isAgent, (msg as any).delivery_channel || selected.channel) || fmtTime(msg.created_at)}
                        </span>

                        {(msg as any).is_ai && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#8b5cf6', fontWeight: 700 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/></svg>
                            AI reply · AI can make mistakes
                          </span>
                        )}

                        {/* Who on the team has seen it. Shown on BOTH sides — on an
                            agent message it answers "did my colleague see this?",
                            which is the question people actually have. */}
                        {readBy.length > 0 && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <span>Read by:</span>
                            <span style={{ display: 'inline-flex', gap: 2 }}>
                              {readBy.slice(0, 3).map((r: any, ri: number) => (
                                <span key={ri} title={`Read by ${r.name}${r.at ? ` · ${new Date(r.at).toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}`}
                                  style={{ width: 15, height: 15, borderRadius: '50%', background: companyInfo?.accent_color || 'var(--coral)', color: '#fff', fontSize: 8, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {r.initial}
                                </span>
                              ))}
                              {readBy.length > 3 && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>+{readBy.length - 3}</span>
                              )}
                            </span>
                          </span>
                        )}
                      </p>

                      {/* Hover actions: react + reply */}
                      <div className={`chat-msg-actions${showReactPicker === msg.id ? ' pinned' : ''}`} style={{ position: 'absolute', top: -10, [isAgent ? 'left' : 'right']: -8, display: 'flex', gap: 2, background: '#fff', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', padding: '2px 4px', opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none' } as any}>
                        <button type="button" onClick={() => setShowReactPicker(showReactPicker === msg.id ? null : msg.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--slate)', display: 'inline-flex' }} title="React">{Icon.smile(14)}</button>
                        <button type="button" onClick={() => { setReplyTo(msg); textareaRef.current?.focus() }}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="Reply">↩</button>
                      </div>

                      {/* Reaction picker */}
                      {showReactPicker === msg.id && (
                        <div data-react-picker className="chat-react-picker"
                          onMouseDown={e => e.stopPropagation()}
                          style={{ position: 'absolute', top: -40, [isAgent ? 'right' : 'left']: 0, display: 'flex', gap: 2, background: '#fff', borderRadius: 24, boxShadow: '0 4px 16px rgba(0,0,0,0.16)', padding: '5px 8px', zIndex: 20 } as any}>
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
              })]
              })()}
              <div ref={messagesEndRef} />
            </div>

            <style>{`
              .chat-msg-row:hover .chat-msg-actions,
              .chat-msg-row .chat-msg-actions.pinned { opacity: 1 !important; pointer-events: auto !important; }
              /* The picker sat 34px above the smiley with a dead gap between them:
                 the cursor left the row on the way up, the row's :hover dropped,
                 and everything vanished before you got there. This invisible
                 bridge keeps the pointer inside the hoverable area the whole way. */
              .chat-react-picker::before {
                content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 22px;
              }
              .chat-att:hover .chat-att-fwd { opacity: 1 !important; }
            `}</style>

            {/* Reply box */}
            <div className="inbox-composer" style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid var(--border)', position: 'relative' }}>
              {/* Email threads get a proper email composer (To/Cc/Subject +
                  signature) instead of the plain chat box. */}
              {activeChannel === 'email' ? (
                <EmailComposer
                  conversationId={selected.id}
                  companyId={companyId}
                  toEmail={contact?.email || ''}
                  defaultSubject={(selected as any).email_subject
                    ? (/^re:/i.test((selected as any).email_subject) ? (selected as any).email_subject : `Re: ${(selected as any).email_subject}`)
                    : `Re: ${selected.subject || 'your message'}`}
                  fromLabel={emailFromLabel}
                  signature={emailSignature}
                  agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]}
                  onSent={async () => {
                    const { data: msgs } = await (supabase as any).from('messages').select('*').eq('conversation_id', selected.id).order('created_at', { ascending: true })
                    setMessages(msgs || [])
                    scrollBottom()
                    loadConversations()
                  }}
                />
              ) : (
              <>
              {/* Reply-to preview */}
              {replyTo && (() => {
                // A photo message has no text content, so the preview used to be
                // blank — you couldn't tell what you were replying to. Show the
                // thumbnail instead.
                const rAtts = Array.isArray((replyTo as any).attachments) ? (replyTo as any).attachments : []
                const rMedia = rAtts.find((a: any) => a.kind === 'image' || a.kind === 'video')
                const label = (replyTo.content || '').trim()
                  || (rMedia ? (rMedia.kind === 'video' ? 'Video' : 'Photo') : '')
                  || (rAtts.length ? rAtts[0].name || 'Attachment' : 'Message')
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--canvas)', borderRadius: 8, marginBottom: 8, borderLeft: '3px solid var(--coral)' }}>
                    {rMedia && (
                      rMedia.kind === 'video' ? (
                        <video src={rMedia.url} style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <img src={rMedia.url} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      )
                    )}
                    <span style={{ fontSize: 12, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ↩ Replying to {replyTo.sender_name}: {label.slice(0, 50)}
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14 }}>✕</button>
                  </div>
                )
              })()}

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

              {/* Quick responses — type "/" to pick a saved reply */}
              {showQuickMenu && (
                <div ref={quickMenuRef} style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 6, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 70, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                  <p style={{ margin: 0, padding: '8px 14px 6px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Quick responses</p>
                  {quickMatches.map((r, i) => (
                    <button key={r.id} type="button"
                      onMouseEnter={() => setQuickIndex(i)}
                      onClick={() => applyQuickResponse(r)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: i === quickIndex ? 'var(--peach)' : 'none', cursor: 'pointer' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{r.title || 'Reply'}</span>
                        <code style={{ fontSize: 11, color: 'var(--coral)', background: 'var(--canvas)', padding: '1px 6px', borderRadius: 5 }}>/{(r.shortcut || '').replace(/^\//, '')}</code>
                      </span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.body}</span>
                    </button>
                  ))}
                </div>
              )}

              <textarea ref={textareaRef} value={reply} onChange={e => {
                  const v = e.target.value
                  setReply(v)
                  // Detect an in-progress "@name" token at the caret so the
                  // mention picker can offer team members.
                  const caret = e.target.selectionStart ?? v.length
                  const upto = v.slice(0, caret)
                  const m = upto.match(/@([\w.\-]*)$/)
                  if (m) { setMentionQuery(m[1]); setMentionIndex(0) } else setMentionQuery(null)
                }}
                onKeyDown={e => {
                  // @mention picker takes priority when it's open.
                  if (mentionQuery !== null && mentionMatches.length) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % mentionMatches.length); return }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length); return }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                      e.preventDefault(); applyMention(mentionMatches[mentionIndex]); return
                    }
                    if (e.key === 'Escape') { setMentionQuery(null); return }
                  }
                  // Quick-response picker takes priority over sending.
                  if (showQuickMenu && quickMatches.length) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setQuickIndex(i => (i + 1) % quickMatches.length); return }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setQuickIndex(i => (i - 1 + quickMatches.length) % quickMatches.length); return }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                      e.preventDefault(); applyQuickResponse(quickMatches[quickIndex]); return
                    }
                    if (e.key === 'Escape') { setShowQuickMenu(false); return }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
                }}
                placeholder={internalMode
                  ? 'Internal note — only your team will see this. Use @ to mention someone.'
                  : 'Type a reply… (Enter to send, / for quick responses)'}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: internalMode ? '1px dashed #f59e0b' : '1px solid var(--border)', background: internalMode ? '#fffbeb' : '#fff', fontStyle: internalMode ? 'italic' : 'normal', fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }} />

              {/* @mention picker */}
              {mentionQuery !== null && mentionMatches.length > 0 && (
                <div style={{ position: 'absolute', bottom: '100%', left: 12, right: 12, marginBottom: 6, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', maxHeight: 220, overflowY: 'auto', zIndex: 60 }}>
                  <p style={{ margin: 0, padding: '8px 12px 4px', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Mention a team member</p>
                  {mentionMatches.map((m: any, i: number) => (
                    <button key={m.id} type="button" onClick={() => applyMention(m)}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: i === mentionIndex ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {(m.name || '?').charAt(0).toUpperCase()}
                      </span>
                      {m.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Live typing preview — what the customer is typing right now.
                  Admin-only; the customer never sees the agent's draft. */}
              {liveTyping.trim() && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', borderRadius: 10, background: '#f0f9ff', border: '1px dashed #7dd3fc', marginBottom: 8 }}>
                  <span style={{ display: 'flex', gap: 2, paddingTop: 5, flexShrink: 0 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#0284c7', animation: `typingDot 1.2s ${i * 0.15}s infinite` }} />
                    ))}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 10.5, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Customer is typing</p>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: '#0c4a6e', fontStyle: 'italic', wordBreak: 'break-word' }}>{liveTyping}</p>
                  </div>
                </div>
              )}

              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }}
                onChange={e => { handleFileUpload(e.target.files); e.target.value = '' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {/* Send poll/survey/form/payment */}
                  <div ref={sendMenuRef} style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setShowSendMenu(v => !v)} title="Send poll, survey, form or payment"
                      style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: showSendMenu ? 'var(--peach)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    </button>
                    {showSendMenu && (
                      <div style={{ position: 'absolute', bottom: '120%', left: 0, width: 200, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
                        {[['poll', Icon.poll(), 'Send Poll'], ['survey', Icon.survey(), 'Send Survey'], ['form', Icon.form(), 'Send Form']].map(([k, icon, label]: any) => (
                          <button key={k} type="button" onClick={() => openPicker(k as any)}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}><span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{icon}</span>{label}</button>
                        ))}

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        <button type="button" onClick={() => openPicker('payment' as any)}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{Icon.payment()}</span>Send Payment Link
                        </button>

                        <button type="button" onClick={() => { setShowSendMenu(false); setShowChargeCard(true); loadSavedCards() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                          </span>Charge Card
                        </button>

                        <button type="button" onClick={() => { setShowSendMenu(false); openSchedule() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                          </span>Schedule delivery
                        </button>

                        <button type="button" onClick={() => { setShowSendMenu(false); saveCard() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><path d="M16 15h3"/></svg>
                          </span>Save Card
                        </button>
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
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Icon.smile(16)}</button>
                  {/* Review request */}
                  <button type="button" onClick={sendReviewRequest} title="Send review request"
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Review
                  </button>
                  {/* Internal note toggle — staff-only message */}
                  <button type="button" onClick={() => setInternalMode(v => !v)}
                    title={internalMode ? 'Switch back to replying to the customer' : 'Write an internal note only your team can see'}
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: internalMode ? '1px solid #f59e0b' : '1px solid var(--border)', background: internalMode ? '#fef3c7' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: internalMode ? '#b45309' : 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
                    {internalMode ? 'Internal note' : 'Note'}
                  </button>
                  {/* Shorten a URL straight into the reply */}
                  <div style={{ position: 'relative' }}>
                    <button type="button" onClick={() => setShowShortener(v => !v)}
                      title="Create a short, trackable link"
                      style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: showShortener ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: showShortener ? 'var(--coral)' : 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      Short link
                    </button>
                    {showShortener && (
                      <div style={{ position: 'absolute', bottom: '120%', left: 0, zIndex: 90, width: 320, maxWidth: '80vw', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', padding: 12 }}>
                        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Create short URL</p>
                        <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.4 }}>
                          Paste a long URL — it becomes a short link on your own domain and records clicks.
                        </p>
                        <input value={shortenInput} onChange={e => setShortenInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); shortenIntoReply() } }}
                          placeholder="https://roxyaquarium.com.au/..." autoFocus
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box' }} />
                        {shortenError && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#dc2626' }}>{shortenError}</p>}
                        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                          <button type="button" onClick={shortenIntoReply} disabled={shortenBusy || !shortenInput.trim()}
                            style={{ flex: 1, padding: '7px 12px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: shortenBusy || !shortenInput.trim() ? 0.5 : 1 }}>
                            {shortenBusy ? 'Shortening…' : 'Shorten & insert'}
                          </button>
                          <button type="button" onClick={() => { setShowShortener(false); setShortenInput(''); setShortenError('') }}
                            style={{ padding: '7px 12px', borderRadius: 8, background: '#fff', border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--slate)' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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
                  {/* Send + channel selector */}
                  <div ref={channelMenuRef} style={{ position: 'relative', display: 'flex' }}>
                    <button type="button" onClick={sendReply} disabled={sending || !reply.trim()}
                      style={{ padding: '8px 16px', borderRadius: internalMode ? 10 : '10px 0 0 10px', background: !reply.trim() ? '#e5e7eb' : internalMode ? '#f59e0b' : 'var(--coral)', color: reply.trim() ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 700, cursor: reply.trim() ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                      {sending
                        ? (internalMode ? 'Saving…' : 'Sending…')
                        : internalMode
                          ? 'Add note'
                          : `Send${sendChannel !== 'auto' ? ` via ${sendChannel.toUpperCase()}` : ''} →`}
                    </button>
                    {!internalMode && (
                    <>
                    <button type="button" onClick={() => setShowChannelMenu(v => !v)} disabled={sending}
                      title="Choose a channel"
                      style={{ padding: '8px 8px', borderRadius: '0 10px 10px 0', background: reply.trim() ? 'var(--coral)' : '#e5e7eb', color: reply.trim() ? '#fff' : '#9ca3af', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>

                    {showChannelMenu && (
                      <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 190, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                        <p style={{ margin: 0, padding: '6px 14px 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Send via</p>
                        {([
                          ['auto', 'Automatic', true],
                          ['chat', 'Live chat', true],
                          ['sms', 'SMS', !!((selected as any).sms_number || contact?.phone)],
                          ['email', 'Email', !!contact?.email],
                        ] as any[]).map(([key, label, available]: any) => (
                          <button key={key} type="button" disabled={!available}
                            onClick={() => { setSendChannel(key); setShowChannelMenu(false) }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: sendChannel === key ? 'var(--peach)' : 'none', cursor: available ? 'pointer' : 'not-allowed', fontSize: 13, color: available ? 'var(--ink)' : '#c0c4cc', fontWeight: sendChannel === key ? 700 : 500 }}>
                            {label}
                            {!available && <span style={{ fontSize: 10, color: '#c0c4cc' }}>n/a</span>}
                            {sendChannel === key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                          </button>
                        ))}
                      </div>
                    )}
                    </>
                    )}
                  </div>
                </div>
              </div>
              </>
              )}
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
            {/* The Orders tab used to appear only once orders had finished
                loading (wooCustomer || wooOrders.length), so on first open it was
                missing and you had to click Timeline to trigger the load before
                it showed. Always render it; it shows its own empty state. */}
            {(['info', 'timeline', 'orders'] as const).map(p => (
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
              proof_of_delivery: { label: 'Proof of Delivery', icon: Icon.box },
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
                    {[...enabledActions, ...(enabledActions.some(([k]: any) => k === 'proof_of_delivery') ? [] : [['proof_of_delivery', {}]])].map(([key, cfg]: any) => {
                      const meta = ACTION_META[key] || { label: key, icon: (s?: number) => <span>•</span> }
                      return (
                        <button key={key} type="button"
                          onClick={async () => {
                            setShowActionMenu(false)
                            if (key === 'doa' || key === 'return_refund') setShowDoa(true)
                            else if (key === 'create_order') setShowCreateOrder(true)
                            else if (key === 'send_coupon') { setCouponAmount(''); setCouponCode(''); setCouponType('fixed'); setCouponOneTime(true); setCouponExpiry(''); setShowCoupon(true) }
                            else if (key === 'support_ticket') { setTicketSubject(selected?.subject || ''); setTicketDesc(''); setTicketPriority('normal'); setShowTicketPanel(true) }
                            else if (key === 'proof_of_delivery') { setPodNote(''); setPodFiles([]); setShowPod(true) }
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
                {/* Coax-style contact card header */}
                {contact && !showContactEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '4px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
                    {(contact as any).avatar_url ? (
                      <img src={(contact as any).avatar_url} alt={contact.name || ''} style={{ width: 84, height: 84, borderRadius: 14, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 84, height: 84, borderRadius: 14, background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>
                        {(contact.name || contact.email || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    {/* Channel chips — which channels we can reach this contact on */}
                    <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {[
                        ['phone', !!contact.phone, '#6b7280', (s: number) => Icon.phone?.(s)],
                        ['email', !!contact.email, '#6b7280', (s: number) => Icon.mail?.(s)],
                      ].filter(([, on]) => on).map(([key], idx) => (
                        <span key={idx} style={{ width: 30, height: 30, borderRadius: '50%', background: '#f1f2f4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4b5563' }}>
                          {key === 'phone'
                            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>}
                        </span>
                      ))}
                    </div>
                    <h3 style={{ margin: '12px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>{contact.name || contact.email || 'Visitor'}</h3>
                    {(contact as any).is_blocked && (
                      <span style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 800, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
                        Blocked
                      </span>
                    )}
                    {/* Quick actions */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      {/* Assign — its own dropdown, anchored to THIS button.
                          It used to trigger the header's assign menu via a
                          synthetic click, which opened a panel up at the top of
                          the page and looked broken. */}
                      <div style={{ position: 'relative' }} data-card-assign>
                        <button type="button" title="Assign"
                          onClick={() => { setShowCardAssign(v => !v); setCardAssignSearch('') }}
                          style={cardAction('#ecfdf5', '#059669')}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                        </button>
                        {showCardAssign && (
                          <div style={{ position: 'absolute', top: '110%', left: 0, width: 230, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 70, overflow: 'hidden', textAlign: 'left' }}>
                            <p style={{ margin: 0, padding: '10px 14px 6px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Assign User</p>
                            <div style={{ padding: '0 10px 8px' }}>
                              <div style={{ position: 'relative' }}>
                                <input autoFocus value={cardAssignSearch} onChange={e => setCardAssignSearch(e.target.value)}
                                  placeholder="Search users…"
                                  style={{ width: '100%', padding: '7px 26px 7px 10px', fontSize: 12.5, borderRadius: 8, border: '1px solid var(--border)', outline: 'none', boxSizing: 'border-box' }} />
                                {cardAssignSearch && (
                                  <button type="button" onClick={() => setCardAssignSearch('')}
                                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                              <button type="button" onClick={() => { assignTo(null); setShowCardAssign(false) }}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444' }}>
                                Unassign
                              </button>
                              {teamMembers.filter((m: any) => !cardAssignSearch || (m.name || '').toLowerCase().includes(cardAssignSearch.toLowerCase())).map((m: any) => (
                                <button key={m.id} type="button" onClick={() => { assignTo(m); setShowCardAssign(false) }}
                                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: selected?.assigned_to === m.user_id ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                    {m.name?.charAt(0).toUpperCase()}
                                  </span>
                                  {m.name}
                                  {selected?.assigned_to === m.user_id && ' ✓'}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      <button type="button" title="Edit contact" onClick={() => { setShowContactEdit(true); setEditContact(contact) }}
                        style={cardAction('#eff6ff', '#2563eb')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <a href={`/admin/customers/profile?id=${contact.id}`} title="Full profile"
                        style={{ ...cardAction('#eff6ff', '#2563eb'), textDecoration: 'none' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </a>
                      <button type="button" title="Close conversation" onClick={() => setStatus('closed')}
                        style={cardAction('#fef2f2', '#dc2626')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      </button>
                      {/* More options — block / report spam live in here rather
                          than as extra buttons on the row, which overflowed. */}
                      <div style={{ position: 'relative' }} data-card-more>
                        <button type="button" title="More options"
                          onClick={() => setShowCardMore(v => !v)}
                          style={cardAction('#f3f4f6', '#4b5563')}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
                        </button>
                        {showCardMore && (
                          <div style={{ position: 'absolute', top: '110%', right: 0, width: 210, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 70, overflow: 'hidden', padding: '4px 0', textAlign: 'left' }}>
                            <button type="button" onClick={() => { setShowCardMore(false); reportSpam() }}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: '#c2410c' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                              Report spam
                            </button>
                            <button type="button" onClick={() => { setShowCardMore(false); toggleBlockContact() }}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: (contact as any).is_blocked ? '#059669' : '#dc2626', borderTop: '1px solid var(--border)' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
                              {(contact as any).is_blocked ? 'Unblock this contact' : 'Block this contact'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
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
                    {/* Why this contact is (or isn't) marketable — the basis you'd
                        need to be able to point to if an opt-out is disputed. */}
                    {((editContact as any).consent_basis || (editContact as any).unsubscribed_at) && (
                      <div style={{ marginTop: -6, marginBottom: 8, fontSize: 11, color: 'var(--slate)', lineHeight: 1.5 }}>
                        {(editContact as any).unsubscribed_at ? (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>
                            Unsubscribed {(editContact as any).unsubscribe_method === 'sms_keyword' ? 'by replying STOP' : ''} · do not include in campaigns
                          </span>
                        ) : (
                          <>
                            Consent: <strong style={{ color: 'var(--ink)' }}>{(editContact as any).consent_basis}</strong>
                            {(editContact as any).consent_source ? ` — ${(editContact as any).consent_source}` : ''}
                          </>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'none' }}>
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
                    {(() => {
                      // Prefer the contact's own address; if blank, pull the
                      // billing address from their most recent WooCommerce order
                      // (a customer who's ordered has an address on file even if
                      // their Colvy contact record is empty).
                      const ownAddress = [addrToString(contact.address), contact.city, contact.country].filter(Boolean).join(', ')
                      let addressValue = ownAddress
                      let addressFromOrder = false
                      if (!ownAddress && wooOrders.length > 0) {
                        const b = wooOrders.find((o: any) => o.billing?.address_1)?.billing
                        if (b) {
                          addressValue = [b.address_1, b.address_2, b.city, b.state, b.postcode].filter(Boolean).join(', ')
                          addressFromOrder = true
                        }
                      }
                      // Also fall back to an abandoned cart's address (it often
                      // carries the shipping/billing address the customer entered
                      // at checkout even though they didn't complete the order).
                      if (!addressValue && abandonedCarts.length > 0) {
                        const c: any = abandonedCarts.find((ac: any) => ac.address || ac.billing_address_1 || ac.city || ac.address_1)
                        if (c) {
                          addressValue = addrToString(c.address)
                            || [c.address_1 || c.billing_address_1, c.city || c.billing_city, c.state || c.billing_state, c.postcode || c.billing_postcode].filter(Boolean).join(', ')
                          addressFromOrder = true
                        }
                      }
                      return ([
                      ['name', 'Name', contact.name],
                      ['company', 'Company', (contact as any).company],
                      ['email', 'Email', contact.email],
                      ['phone', 'Phone', contact.phone],
                      ['address', 'Address', addressValue],
                    ] as [string, string, string][])
                      .map(([field, label, value]) => {
                        const aiFilled = aiSavedFields.has(field as string) && !!value
                        const showOrderTag = field === 'address' && addressFromOrder && !!value
                        return (
                        <div key={field} className="contact-field-row"
                          style={{ position: 'relative', borderRadius: 8, padding: aiFilled ? '5px 7px' : 0, margin: aiFilled ? '0 -7px' : 0, background: aiFilled ? '#f7f8fa' : 'transparent' }}>
                          <p style={{ margin: '0 0 2px 0', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {label}
                            {showOrderTag && <span style={{ fontSize: 8.5, color: '#2563eb', background: '#eef4ff', padding: '1px 5px', borderRadius: 10, letterSpacing: 0 }}>from order</span>}
                          </p>
                          {editField === field ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {field === 'address' ? (
                                <AddressAutocomplete
                                  value={editFieldValue}
                                  onChange={setEditFieldValue}
                                  onSelect={(parts) => {
                                    // Save the verified address, and split city/
                                    // state/country into their own fields.
                                    setEditFieldValue(parts.formatted)
                                    saveSingleField('address', parts.line1 || parts.formatted)
                                    if (parts.city) saveSingleField('city', parts.city)
                                    if (parts.country) saveSingleField('country', parts.country)
                                  }}
                                  style={{ ...inp, fontSize: 12, padding: '5px 8px' } as any}
                                />
                              ) : (
                              <input autoFocus value={editFieldValue} onChange={e => setEditFieldValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') saveSingleField(field, editFieldValue); if (e.key === 'Escape') setEditField(null) }}
                                style={{ ...inp, fontSize: 12, padding: '5px 8px' }} />
                              )}
                              <button type="button" onClick={() => saveSingleField(field, editFieldValue)} style={fieldBtn('#059669')} title="Save">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                              </button>
                              <button type="button" onClick={() => setEditField(null)} style={fieldBtn('var(--slate)')} title="Cancel">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            </div>
                          ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {aiFilled && (
                              <span className="ai-spark" title="" style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, color: '#8b5cf6' }}>
                                <AiSparkIcon size={13} />
                                <span className="ai-tip" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', background: '#1a1a1a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 7, opacity: 0, pointerEvents: 'none', transition: 'opacity 0.12s', zIndex: 20 }}>
                                  Auto added by Colvy AI
                                </span>
                              </span>
                            )}
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
                        )
                      })
                    })()}

                    {/* ── Delivery (Coax-style) ─────────────────────────────
                        Scheduled delivery date + status, saved inline. */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {Icon.calendar(12)} Scheduled Delivery
                      </p>
                      {/* Opens the full calendar slide-out rather than a bare
                          date box — you can pick the date, set the window, add
                          a note and it books a real Delivery event on the team
                          calendar. */}
                      <button type="button" onClick={() => setShowDeliveryPanel(true)}
                        style={{ ...inp, fontSize: 12.5, padding: '8px 9px', textAlign: 'left', cursor: 'pointer', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ color: (contact as any).scheduled_delivery ? 'var(--ink)' : '#c0c0c5' }}>
                          {(contact as any).scheduled_delivery
                            ? new Date((contact as any).scheduled_delivery).toLocaleDateString('en-AU', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                            : 'Schedule a delivery'}
                        </span>
                        <span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{Icon.calendar(14)}</span>
                      </button>
                    </div>

                    <div>
                      <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {Icon.box(12)} Delivery status
                      </p>
                      <select
                        value={(contact as any).delivery_status || ''}
                        onChange={async e => {
                          const v = e.target.value || null
                          setContact((c: any) => ({ ...c, delivery_status: v }))
                          await (supabase as any).from('contacts').update({ delivery_status: v }).eq('id', contact.id)
                          showToast('Delivery status updated')
                        }}
                        style={{ ...inp, fontSize: 12.5, padding: '7px 9px', cursor: 'pointer' }}>
                        <option value="">--</option>
                        <option value="pending">Pending</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="out_for_delivery">Out for delivery</option>
                        <option value="delivered">Delivered</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>

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

                  {/* Cross-channel identity: every channel this person has used,
                      linked by shared email/phone. Same human, one profile. */}
                  {linkedChannels.length > 1 && (
                    <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                      <p style={{ margin: '0 0 7px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>Also reachable on</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {linkedChannels.map((lc, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ display: 'flex', flexShrink: 0 }}>{CHANNEL_ICON[String(lc.channel).toLowerCase()] || Icon.chat(14)}</span>
                            <span style={{ fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {CHANNEL_NAME[String(lc.channel).toLowerCase()] || lc.channel}
                              {lc.label ? <span style={{ color: 'var(--slate)' }}> · {lc.label}</span> : null}
                            </span>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setShowTimeline(true)}
                        style={{ marginTop: 9, width: '100%', padding: '7px 0', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: '#2563eb', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        View all conversations →
                      </button>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>Channel</p>
                      {/* The LIVE channel, not the one the conversation started
                          on — a customer who began on the widget and is now
                          texting should read "SMS" here. */}
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {CHANNEL_ICON[activeChannel] || Icon.chat(14)}
                        {CHANNEL_NAME[activeChannel] || activeChannel}
                      </p>
                      {!isWebChat && String((selected as any).channel || '').toLowerCase() !== activeChannel && (
                        <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#9ca3af' }}>
                          Started on {CHANNEL_NAME[String((selected as any).channel || '').toLowerCase()] || 'live chat'}
                        </p>
                      )}
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
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6 }}>{Icon.person(13)}{selected.assigned_name}</p>
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
                          <div key={i}
                            style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--canvas)' }}>
                            <div onClick={() => setGalleryIndex(i)} style={{ position: 'absolute', inset: 0 }}>
                              {(a.kind === 'video' || String(a.type).startsWith('video'))
                                ? <video src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            {/* Forward it to another customer */}
                            <button type="button"
                              onClick={e => { e.stopPropagation(); setForwarding(a); setForwardSearch(''); setForwardResults([]) }}
                              title="Forward to another contact"
                              style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                            </button>
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
                          {/* A paid order doesn't need a payment request — the
                              useful action there is refunding it. */}
                          {String(o.status || '').toLowerCase() === 'processing' && (
                            <button type="button" onClick={() => markOrderCompleted(payload)} style={miniBtn('#15803d')}>Mark completed</button>
                          )}
                          {['processing', 'completed'].includes(String(o.status || '').toLowerCase())
                            ? <button type="button" onClick={() => issueOrderRefund(payload)} style={miniBtn('#b45309')}>Issue refund</button>
                            : <button type="button" onClick={() => sendOrderPaymentRequest(payload)} style={miniBtn('#635BFF')}>Payment request</button>}
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
