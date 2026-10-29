// Helpers, icons and small components shared by the inbox's pieces.
// Moved out of app/admin/inbox/page.tsx unchanged.

import { toPublicUrl } from '@/lib/storage-url'
import { linkCodesIn, useLinkStats } from '@/components/LinkCards'

// A video attachment's still frame, when it has a real image thumbnail (some
// carry the video URL itself as the "thumbnail", which can't be shown as one).
export const videoPoster = (a: any): string | undefined =>
  a?.thumbUrl && a.thumbUrl !== a.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(a.thumbUrl) ? toPublicUrl(a.thumbUrl) : undefined
// Play mark over a video tile that loads nothing until opened.
export const VideoTileMark = () => (
  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
    <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(15,17,25,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>
    </span>
  </span>
)

// ─── Types ────────────────────────────────────────────────────────────────────
export type Conversation = {
  id: string; company_id: string; contact_id: string | null
  channel: string; status: string; assigned_to: string | null; assigned_name: string | null
  subject: string | null; visitor_id: string | null
  page_url: string | null; page_title: string | null; page_history: any[]; page_seen_at?: string | null
  last_message: string | null; last_message_at: string
  unread_count: number; is_unread: boolean; updated_at: string
  contact?: Contact | null
}
export type Message = {
  id: string; conversation_id: string; sender_type: string
  sender_name: string | null; sender_email: string | null
  content: string; attachments: any[]; metadata: any; created_at: string; is_read: boolean
  email_attachments?: any[]
}
export type Contact = {
  id: string; name: string | null; email: string | null; phone: string | null
  address: string | null; city: string | null; country: string | null
  source: string; tags: string[]; notes: string | null; subscribed_to_marketing: boolean
}
export type TeamMember = { id: string; user_id: string; name: string; role: string; avatar?: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Channel icons are defined below (CHANNEL_ICON) once the `svg` helper exists —
// they used to be emoji, which render differently on every OS and looked like
// clip-art next to the rest of the UI.

// Inline SVG icons (replace emojis for a cleaner, consistent look).
export const svg = (path: React.ReactNode, size = 15) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>{path}</svg>
)
export const AiSparkIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>
  </svg>
)
export const Icon = {
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
export const BrandMessenger = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#0084FF"><path d="M12 2C6.3 2 2 6.2 2 11.7c0 2.9 1.2 5.4 3.1 7.1.2.1.3.4.3.6l.1 1.8c0 .6.6 1 1.1.7l2-.9c.2-.1.4-.1.6 0 .9.3 1.9.4 2.8.4 5.7 0 10-4.2 10-9.7C22 6.2 17.7 2 12 2zm6 7.5l-2.9 4.7c-.5.7-1.5.9-2.2.4l-2.3-1.7c-.2-.2-.5-.2-.7 0l-3.1 2.4c-.4.3-1-.2-.7-.6l2.9-4.7c.5-.7 1.5-.9 2.2-.4l2.3 1.7c.2.2.5.2.7 0l3.1-2.4c.4-.3 1 .2.7.6z"/></svg>
)
export const BrandInstagram = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24"><defs><radialGradient id="igg" cx="0.3" cy="1" r="1"><stop offset="0" stopColor="#FED576"/><stop offset="0.3" stopColor="#F47133"/><stop offset="0.6" stopColor="#BC3081"/><stop offset="1" stopColor="#4C63D2"/></radialGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igg)"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.8"/><circle cx="17" cy="7" r="1.2" fill="#fff"/></svg>
)
export const BrandWhatsApp = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.1.1.3 0 .5l-.3.5c-.1.2-.3.3-.1.6.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.8c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.5.3.1.2.1.7-.1 1.4z"/></svg>
)
export const BrandWoo = (s = 16) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="#873EFF"><path d="M2 6h20a1 1 0 0 1 1 1.5l-2.5 6a1 1 0 0 1-.9.6H6.5l.4 2h11.6v2H6.2a1 1 0 0 1-1-.8L3.3 6.9 2.2 6.7z"/><circle cx="8" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>
)

export const CHANNEL_ICON: Record<string, React.ReactNode> = {
  widget: Icon.chat(16), chat: Icon.chat(16), email: Icon.mail(16), sms: Icon.mobile(16),
  phone: Icon.phone(16), facebook: BrandMessenger(16), messenger: BrandMessenger(16),
  instagram: BrandInstagram(16), whatsapp: BrandWhatsApp(16), woocommerce: BrandWoo(16),
}
export const CHANNEL_NAME: Record<string, string> = {
  widget: 'Live chat', chat: 'Live chat', sms: 'SMS', email: 'Email', phone: 'Phone',
  facebook: 'Messenger', messenger: 'Messenger', instagram: 'Instagram', whatsapp: 'WhatsApp',
  realestate: 'RealEstate',
}

// Monochrome (currentColor) channel marks for the Send button, so the button
// itself shows WHERE the reply will land — Messenger, Instagram, SMS, email,
// WhatsApp, phone or live chat — instead of a generic arrow. They inherit the
// button's text colour (white when active, grey when disabled), matching the
// solid/gradient button background rather than the brand-coloured logos.
// Composer toolbar button: soft rounded square, icon only (tooltip via title).
export const toolBtn = (on = false, tone?: { bg: string; c: string }): React.CSSProperties => ({
  width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: tone ? tone.bg : on ? 'var(--peach)' : '#f3f4f6', color: tone ? tone.c : on ? 'var(--coral)' : '#6b7280',
})

export const sendChannelGlyph = (ch: string, s = 15): React.ReactNode => {
  const c = String(ch || '').toLowerCase()
  if (c === 'instagram') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
  )
  if (c === 'facebook' || c === 'messenger') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z" /></svg>
  )
  if (c === 'whatsapp') return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2zm5.8 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.2.1-1.9-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5.1-4.5-.1-.2-1.2-1.5-1.2-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 1.9c.1.1.1.3 0 .5l-.3.5c-.1.2-.3.3-.1.6.1.2.6 1 1.3 1.6.9.8 1.6 1 1.9 1.2.2.1.4.1.5-.1l.6-.8c.2-.2.4-.2.6-.1l1.8.9c.2.1.4.2.5.3.1.2.1.7-.1 1.4z" /></svg>
  )
  if (c === 'email') return Icon.mail(s)
  if (c === 'sms') return Icon.mobile(s)
  if (c === 'phone' || c === 'voice') return Icon.phone(s)
  return Icon.chat(s)   // widget / chat / anything else
}
export const STATUS_COLOR: Record<string, { bg: string; color: string }> = {
  open:     { bg: '#fef3c7', color: '#d97706' },
  assigned: { bg: '#dbeafe', color: '#2563eb' },
  resolved: { bg: '#dcfce7', color: '#059669' },
  closed:   { bg: '#f3f4f6', color: '#6b7280' },
}
// The status pill's icon, beside its colours.
export const STATUS_ICON: Record<string, React.ReactNode> = {
  open:     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>,
  assigned: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 11-4.7"/><polyline points="15 18 17 20 21 16"/></svg>,
  resolved: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>,
  closed:   <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9"/><line x1="10" y1="13" x2="14" y2="13"/></svg>,
}
// Robustly parse a Supabase/Postgres timestamp. The old code appended 'Z' when
// the string didn't already end in 'Z' — but Supabase returns offsets like
// "+00:00", so that produced "…+00:00Z" (two tz markers), which Safari parses as
// Invalid Date → blank timestamps everywhere. This normalises all the shapes:
//   "2026-07-17T11:04:10.891Z"       (already fine)
//   "2026-07-17T11:04:10.891+00:00"  (has offset → leave it)
//   "2026-07-17 11:04:10.891+00"     (space + short offset → normalise)
//   "2026-07-17T11:04:10.891"        (no tz → treat as UTC, append Z)
export function parseTs(d: string | undefined | null): Date | null {
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
export function timeAgo(d: string) {
  if (!d) return ''
  const parsed = parseTs(d)
  if (!parsed) return ''
  const s = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000))
  if (s < 60) return 'now'; if (s < 3600) return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`; return `${Math.floor(s/86400)}d`
}

// Coax-style list timestamp: "6:12 PM - 17/7"
export function listTime(d: string) {
  if (!d) return ''
  const parsed = parseTs(d)
  if (!parsed) return ''
  // Relative for recent activity ("just now", "5m ago", "1h ago"), then fall
  // back to a date once it's older than a day so the list stays scannable.
  const diffMs = Date.now() - parsed.getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 0) return 'just now'          // clock skew — don't show "in the future"
  if (sec < 45) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  // Older than a week → a plain date (add the year once it's a different year).
  const sameYear = parsed.getFullYear() === new Date().getFullYear()
  return parsed.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

// Time format across the inbox: 12-hour (default) or 24-hour. A COMPANY-level
// choice (companies.inbox_settings.hour12) toggled from the inbox settings, so
// every agent on the team sees the same format. Read by every time formatter
// via this module flag, which is set from the loaded company setting.
export let INBOX_HOUR12 = true
export function timeOpts(): Intl.DateTimeFormatOptions {
  return INBOX_HOUR12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hour12: false }
}
export function setInboxHour12(v: boolean) { INBOX_HOUR12 = v }

// Safe time formatter — handles null, undefined, and non-ISO timestamps
export function fmtTime(d: string | undefined | null) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = parseTs(s)
  if (!parsed) return ''
  return parsed.toLocaleTimeString([], timeOpts())
}
// Formats like "Received 7:18 PM | 08 Jul | Instagram" / "Delivered 2:03 PM | 09 Jul"
export function fmtReceipt(d: string | undefined | null, isAgent: boolean, channel?: string) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = parseTs(s)
  if (!parsed) return ''
  const time = parsed.toLocaleTimeString([], timeOpts())
  const date = parsed.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })
  const label = isAgent ? 'Delivered' : 'Received'
  const NAMES: Record<string, string> = {
    sms: 'SMS', email: 'Email', chat: 'Live Chat', widget: 'Live Chat',
    instagram: 'Instagram', facebook: 'Messenger', messenger: 'Messenger',
    whatsapp: 'WhatsApp', phone: 'Phone Call', upload: 'Upload link', colvy: 'Colvy app',
  }
  const chan = channel ? (NAMES[channel.toLowerCase()] || channel.charAt(0).toUpperCase() + channel.slice(1)) : ''
  // Show the channel on BOTH sides — an agent needs to know a reply went by SMS.
  return `${label} ${time} | ${date}${chan ? ` | ${chan}` : ''}`
}
// The channel to LABEL a message with. A file the customer sent through an
// upload link carries no delivery_channel of its own, so it fell back to the
// conversation's channel and read as "Live Chat" — while having arrived from an
// SMS'd link. Its attachments are marked from_request, so name it from that.
//
// Deliberately not done by stamping delivery_channel: that field also decides
// which channel a reply goes out on, and an upload is not a channel anyone can
// be replied to on.
export function receiptChannel(msg: any, fallback?: string): string | undefined {
  if (Array.isArray(msg?.attachments) && msg.attachments.some((a: any) => a?.from_request)) return 'upload'
  // Customer emails received by the inbound webhook used to be saved without a
  // channel, so the column default ('chat') made them read "Live Chat".
  if (isEmailWithoutChannel(msg)) return 'email'
  // Written in someone's Colvy chat (Colvy's own inbox): say from which workspace.
  const ws = msg?.metadata?.colvy_app?.workspace_name
  if (msg?.delivery_channel === 'colvy' && ws) return `Colvy app · ${String(ws).slice(0, 60)}`
  return msg?.delivery_channel || fallback
}
export function isEmailWithoutChannel(msg: any): boolean {
  const dc = String(msg?.delivery_channel || '').toLowerCase()
  return (!dc || dc === 'chat') && msg?.sender_type === 'visitor' && !!(msg?.email_message_id || msg?.email_in_reply_to)
}
// Two-letter initials from a name — first + last (e.g. "Bikiran Simkhada" → "BS")
// so team members whose first names share a letter stay distinguishable. A
// single-word name uses its first two letters.
export function initialsOf(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
// Interleave conversation events (assignments, channel switches, moves) into the
// message list in chronological order, so the thread reads like a real timeline.
export function mergeEvents(msgs: any[], events: any[], calls: any[] = []) {
  const SHOW = ['assigned', 'channel_switch', 'moved', 'status', 'review_request', 'page_view', 'note_created', 'closed', 'reopened', 'ai_update', 'google_review', 'social_comment']
  const evs = (events || [])
    .filter(e => SHOW.includes(e.event_type))
    .map(e => ({ ...e, __event: true }))

  // Parse each timestamp ONCE, then sort. Parsing inside the comparator ran the
  // regex + Date parse ~2·n·log(n) times on every render of the thread (every
  // keystroke in the composer re-renders it). Array.prototype.sort is stable,
  // so the resulting order is identical.
  const all = [...msgs, ...evs, ...(calls || [])]
  const keyed = all.map(item => ({ item, t: tsOf(item.created_at) }))
  keyed.sort((a, b) => a.t - b.t)
  return keyed.map(k => k.item)
}

// Postgres timestamps come back with or without a trailing Z depending on the
// column type. Parsing inconsistently offset events by the local timezone,
// which shoved them all to the bottom of the thread instead of sorting them
// in among the messages.
export function tsOf(v: any): number {
  if (!v) return 0
  const s = String(v)
  // Already has a timezone (Z or ±HH:MM) → parse as-is.
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(s)
  const d = new Date(hasTz ? s : s.replace(' ', 'T') + 'Z')
  return isNaN(d.getTime()) ? 0 : d.getTime()
}

// ── Open-thread windowing ───────────────────────────────────────────────────
// Long histories (thousands of SMS/chat/email rows with attachments, calls,
// order cards) used to be fetched in full with select('*') and rendered all at
// once every time a conversation opened — and re-fetched in full by every
// poll / refresh. The thread now opens on the newest THREAD_PAGE messages and
// pulls older pages as the agent scrolls up (or all of them when something
// needs the whole history, e.g. in-thread search or the AI summary).
export const THREAD_PAGE = 150
// Last thread shown per conversation, so re-opening a chat (or coming back to
// the inbox) paints its messages instantly while the fresh copy loads. Small
// LRU — module scope survives client-side navigation like lib/client-cache.
export const THREAD_CACHE_MAX = 30
export const threadCache = new Map<string, { msgs: any[]; since: string | null }>()
export function threadCacheGet(id: string) {
  const v = threadCache.get(id)
  if (v) { threadCache.delete(id); threadCache.set(id, v) }
  return v
}
export function threadCacheSet(id: string, v: { msgs: any[]; since: string | null }) {
  threadCache.delete(id)
  threadCache.set(id, v)
  while (threadCache.size > THREAD_CACHE_MAX) {
    const oldest = threadCache.keys().next().value
    if (oldest === undefined) break
    threadCache.delete(oldest)
  }
}
// Run async jobs with bounded concurrency (instead of one-at-a-time awaits).
export async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]
      try { await fn(item) } catch {}
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

// Returns "Today" / "Yesterday" / "12 Jul 2026" for a date divider
export function dayLabel(d: string | undefined | null) {
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
export function fmtDateTime(d: string | undefined | null) {
  if (!d) return ''
  const parsed = new Date(d)
  if (!parsed) return ''
  return parsed.toLocaleString()
}

// Simple AI extraction — looks for phone, email, address patterns in message
export function extractFromText(text: string) {
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
  // Street address, optionally followed by a suburb, AU state and 4-digit
  // postcode. Bounded (word counts capped) so it captures just the address and
  // can't run on into the rest of the message. Handles "9/175 Old Southern Road,
  // South Nowra, NSW. 2541" including the period before the postcode.
  const ST = '(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd|Crescent|Cres|Terrace|Tce|Parade|Pde|Close|Cl|Highway|Hwy)'
  let address = cleaned.match(new RegExp(
    `\\d+[A-Za-z]?(?:[/-]\\d+)?\\s+[A-Za-z][A-Za-z'-]*(?:\\s+[A-Za-z][A-Za-z'-]*){0,4}?\\s+${ST}\\b` +
    `(?:[\\s,]+[A-Za-z][A-Za-z'-]*(?:\\s+[A-Za-z][A-Za-z'-]*){0,3})?` +   // suburb
    `(?:[\\s,]+(?:NSW|VIC|QLD|SA|WA|TAS|ACT|NT)\\b)?` +                    // state
    `(?:[\\s.,]+\\d{4}\\b)?`,                                             // postcode
    'i'))?.[0]?.replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim() || null
  // Name: the customer introducing themselves. Deliberately narrow — only
  // explicit self-introductions, never a guess from surrounding prose, because
  // writing a wrong name onto a contact is worse than leaving it blank.
  //
  // Catches: "my name is Sara Vagg", "I'm Chelsea Groves", "this is Bikiran",
  //          "it's Sara here", "Regards, Sara Vagg"
  let name: string | null = null
  {
    const NAME = "([A-Z][a-z'\\-]{1,20}(?:\\s+[A-Z][a-z'\\-]{1,20}){0,2})"
    const patterns = [
      new RegExp(`(?:my name(?:'s| is)|name(?:'s| is))\\s+${NAME}`),
      new RegExp(`(?:i am|i'm|im)\\s+${NAME}`, 'i'),
      new RegExp(`(?:this is|it's|its)\\s+${NAME}(?:\\s+here)?`, 'i'),
      new RegExp(`(?:regards|thanks|cheers|from)[,\\s]+${NAME}\\s*$`, 'im'),
    ]
    // Words that follow "I'm"/"this is" far more often than a name does.
    const NOT_NAMES = new Set([
      'Just', 'Still', 'Also', 'Sorry', 'Not', 'Very', 'Really', 'Happy', 'Good',
      'Fine', 'Ok', 'Okay', 'Interested', 'Looking', 'Wondering', 'Trying',
      'After', 'About', 'Keen', 'Hoping', 'Waiting', 'Thinking', 'Going',
      'Hi', 'Hello', 'Hey', 'Thanks', 'Thank', 'Regards', 'Cheers',
    ])
    for (const re of patterns) {
      const m = cleaned.match(re)
      const candidate = m?.[1]?.trim()
      if (!candidate) continue
      const first = candidate.split(/\s+/)[0]
      if (NOT_NAMES.has(first)) continue
      // A bare single word is only trusted from an explicit "my name is".
      if (!candidate.includes(' ') && !/name/i.test(m![0])) continue
      name = candidate
      break
    }
  }

  return { phone: phone || null, email: email || null, address: address || null, name: name || null }
}

// Escape a user's search term so it's safe to build a RegExp from.
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Render `text` with every (case-insensitive) occurrence of `q` wrapped in a
// <mark>, so a search result shows exactly what matched. With no query it just
// returns the text unchanged. The highlight is a translucent tint of the theme
// accent (the company's brand colour, coral by default) so it reads correctly
// in both light and dark mode instead of a fixed amber.
export function Highlight({ text, q, accent = 'var(--coral)' }: { text: string; q: string; accent?: string }) {
  const query = (q || '').trim()
  if (!query || !text) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRe(query)})`, 'ig'))
  const lower = query.toLowerCase()
  // color-mix tints the accent over whatever background it sits on, so the same
  // rule works on a light row and a dark one; text stays `inherit` for contrast.
  const bg = `color-mix(in srgb, ${accent} 30%, transparent)`
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === lower
          ? <mark key={i} style={{ background: bg, color: 'inherit', fontWeight: 700, borderRadius: 3, padding: '0 1px' }}>{p}</mark>
          : <span key={i}>{p}</span>
      )}
    </>
  )
}

// Build a short excerpt centred on the first match of `q` within `text`, so a
// deep hit (a message body, transcript, AI summary…) can show WHERE it matched
// even when that text isn't otherwise visible in the conversation row.
export function makeSnippet(text: string, q: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const query = (q || '').trim()
  if (!query) return t.slice(0, 120)
  const i = t.toLowerCase().indexOf(query.toLowerCase())
  if (i < 0) return t.slice(0, 120)
  const start = Math.max(0, i - 32)
  const end = Math.min(t.length, i + query.length + 64)
  return (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '')
}

// A small line-icon for a lifecycle event chip (cart, order, refund…).
export function LifecycleIcon({ kind }: { kind: string }) {
  const p: React.CSSProperties = { width: 15, height: 15, display: 'block' }
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (kind) {
    case 'cart':
      return <svg viewBox="0 0 24 24" style={p} {...common}><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
    case 'recovered':
      return <svg viewBox="0 0 24 24" style={p} {...common}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    case 'refunded':
      return <svg viewBox="0 0 24 24" style={p} {...common}><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
    case 'failed':
      return <svg viewBox="0 0 24 24" style={p} {...common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'placed':
      return <svg viewBox="0 0 24 24" style={p} {...common}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    case 'sale':
      return <svg viewBox="0 0 24 24" style={p} {...common}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
    default:
      return <svg viewBox="0 0 24 24" style={p} {...common}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
  }
}

// A call-type last message ("📞 Voicemail", "Missed call", "Call received · 0:44")
// gets a colour-coded call glyph — matching the mobile app — instead of the plain
// phone emoji: red missed, green received, slate outgoing/ended, purple voicemail.
export type CallKind = 'missed' | 'received' | 'outgoing' | 'voicemail'
export function callGlyphKind(text?: string | null): CallKind | null {
  const s = String(text || '').toLowerCase()
  if (!/📞|☎|voicemail|missed call|call received|incoming call|call ended|call answered|outgoing call|outbound call/.test(s)) return null
  if (/voicemail/.test(s)) return 'voicemail'
  if (/missed/.test(s)) return 'missed'
  if (/received|incoming|answered/.test(s)) return 'received'
  if (/ended|outgoing|outbound|made/.test(s)) return 'outgoing'
  return 'received'
}
export const stripCallEmoji = (t?: string | null) => String(t || '').replace(/^\s*(?:📞|☎️?|📵)\s*/, '')
export function CallGlyph({ kind }: { kind: CallKind }) {
  const color = kind === 'missed' ? '#ef4444' : kind === 'received' ? '#16a34a' : kind === 'voicemail' ? '#8b5cf6' : '#6b7280'
  const common = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, style: { flexShrink: 0 } }
  const handset = <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
  if (kind === 'voicemail') return <svg {...common}><circle cx="6" cy="14" r="4"/><circle cx="18" cy="14" r="4"/><line x1="6" y1="18" x2="18" y2="18"/></svg>
  if (kind === 'outgoing') return <svg {...common}><polyline points="23 7 23 1 17 1"/><line x1="16" y1="8" x2="23" y2="1"/>{handset}</svg>
  // missed (red) and received (green) both read as an incoming call; colour separates them.
  return <svg {...common}><polyline points="16 2 16 8 22 8"/><line x1="23" y1="1" x2="16" y2="8"/>{handset}</svg>
}

// Phrases that suggest a payment just happened — drives the "record this sale?"
// prompt. Lower-cased substring match against recent messages.
export const PAYMENT_SIGNAL_PHRASES = [
  'i have paid', "i've paid", 'ive paid', 'just paid', 'paid the invoice', 'invoice paid',
  'payment sent', 'sent the payment', 'sent payment', 'sent you the payment', 'made the payment',
  'made payment', 'bank transfer', 'transferred the', 'transferred it', 'sent the money',
  'paid via', 'payment done', 'paid it', 'paid now', 'have paid', 'thank you for the payment',
  'thanks for the payment', 'thanks for your payment', 'receipt attached', 'uploaded the receipt',
  'sent the receipt', 'sent you the receipt', 'here is the receipt', "here's the receipt",
  'deposited', 'e-transfer', 'etransfer', 'payment made',
]

// Review-request card wrapper: feeds the tracked link's live stats (opens,
// last device / city) into the card's render function.
export function ReviewCard({ msg, companyId, render }: { msg: any; companyId: string | null; render: (s: any) => React.ReactNode }) {
  const codes = linkCodesIn(msg?.content).slice(0, 1)
  const [s] = useLinkStats(companyId, codes)
  return <>{render(s || null)}</>
}

export const IFL_CSS = `
.ifl-wrap{position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,15,20,.32);animation:iflFade .18s ease both}
.ifl{width:560px;max-width:100%;max-height:min(760px,92vh);display:flex;flex-direction:column;background:#fff;border-radius:24px;box-shadow:0 30px 80px -20px rgba(16,24,40,.35);animation:iflIn .26s cubic-bezier(.22,1,.36,1) both;overflow:hidden}
.ifl button::before{display:none!important}
.ifl-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 10px}
.ifl-head h2{margin:0;display:flex;align-items:center;gap:8px;font-size:20px;font-weight:800;letter-spacing:-.02em;color:var(--ink,#111)}
.ifl-count{min-width:22px;height:22px;padding:0 7px;box-sizing:border-box;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:#18181b;color:#fff;font-size:12px;font-weight:700}
.ifl-x{width:34px;height:34px;border-radius:50%;border:none;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.ifl-x:hover{background:#ececef}
.ifl-body{flex:1;min-height:0;overflow-y:auto;padding:6px 22px 18px;display:flex;flex-direction:column;gap:18px}
.ifl-body section{min-width:0}
.ifl-l{margin:0 0 8px;font-size:13px;font-weight:650;color:#111}
.ifl-chips{display:flex;flex-wrap:wrap;gap:6px}
.ifl-chips .il-chip{height:34px;padding:0 14px}
.ifl-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ifl-field{width:100%;height:42px;box-sizing:border-box;padding:0 14px;border:1px solid transparent;border-radius:12px;background:#f4f4f5;color:#111;font:inherit;font-size:14px;outline:none;appearance:auto}
.ifl-field:focus{background:#fff;border-color:#e4e4e7;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 18%,transparent)}
.ifl-dates{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.ifl-dates label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:600;color:#71717a}
.ifl-dates input{height:42px;box-sizing:border-box;padding:0 12px;border:1px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14px;color:#111;outline:none}
.ifl-dates input:focus{background:#fff;border-color:#e4e4e7}
.ifl-search{position:relative}
.ifl-search svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#71717a;pointer-events:none}
.ifl-search .ifl-field{padding-left:38px;border-radius:999px}
.ifl-hint{margin:6px 2px 0;font-size:12px;color:#8e8e93}
.ifl-seg{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;width:260px;max-width:100%;padding:3px;border-radius:12px;background:#f4f4f5}
.ifl-seg .cmp-mode-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:9px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08),0 2px 6px -2px rgba(16,24,40,.12);transition:transform .28s cubic-bezier(.22,1,.36,1)}
.ifl-seg button{position:relative;z-index:1;height:32px;border:none;background:none;font:inherit;font-size:13px;font-weight:650;color:#71717a;cursor:pointer}
.ifl-seg button[aria-selected="true"]{color:#111}
.ifl-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 22px 18px;border-top:1px solid #f0f0f2}
.ifl-reset{height:42px;padding:0 18px;border-radius:999px;border:none;background:none;color:#52525b;font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.ifl-reset:hover:not(:disabled){background:#f4f4f5}
.ifl-reset:disabled{opacity:.4;cursor:default}
.ifl-go{height:44px;padding:0 22px;border-radius:999px;border:none;background:#0d0d0d;color:#fff;font:inherit;font-size:14px;font-weight:650;cursor:pointer;transition:transform .15s,background .15s}
.ifl-go:hover{background:#27272a}
.ifl-go:active{transform:scale(.98)}
@media (max-width:560px){
  .ifl-wrap{align-items:flex-end;padding:0}
  .ifl{border-radius:24px 24px 0 0;max-height:92vh;animation:iflUp .3s cubic-bezier(.22,1,.36,1) both}
  .ifl-two{grid-template-columns:1fr}
  .ifl-foot{padding-bottom:calc(18px + env(safe-area-inset-bottom))}
}
@keyframes iflFade{from{opacity:0}to{opacity:1}}
@keyframes iflIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@keyframes iflUp{from{transform:translateY(100%)}to{transform:none}}
@media (prefers-reduced-motion:reduce){.ifl-wrap,.ifl{animation:none}}
`
