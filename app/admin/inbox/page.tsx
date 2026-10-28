'use client'

import { VoiceTag } from '@/components/VoiceTag'
import { voiceKind, tagVoice } from '@/lib/voice-typed'
import { useAttachmentToken } from '@/lib/useAttachmentToken'
import VoicePlayer from '@/components/VoicePlayer'
import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import AiLiveReply from '@/components/AiLiveReply'
import AgentSuggestion from '@/components/AgentSuggestion'
import { WhyLink } from '@/components/WhyAgent'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { peekCompanyUser, resolveCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { uploadAttachment, readJsonSafe } from '@/lib/upload-attachment'
import MentionInput, { resolveMentions as resolveTeamMentions } from '@/components/MentionInput'
import { decodeEntities as dec } from '@/lib/decode-entities'
import { enrichNames } from '@/lib/team-names'
import AddContactModal from '@/components/AddContactModal'
import SendTrackingModal from '@/components/SendTrackingModal'
import VoiceDictationButton from '@/components/VoiceDictationButton'
import { useDraft } from '@/lib/drafts'
import { uploadQueue } from '@/lib/upload-queue'
import { toPublicUrl, sizedImageUrl, sizedImageFallback } from '@/lib/storage-url'

// A video attachment's still frame, when it has a real image thumbnail (some
// carry the video URL itself as the "thumbnail", which can't be shown as one).
const videoPoster = (a: any): string | undefined =>
  a?.thumbUrl && a.thumbUrl !== a.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(a.thumbUrl) ? toPublicUrl(a.thumbUrl) : undefined
// Play mark over a video tile that loads nothing until opened.
const VideoTileMark = () => (
  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
    <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(15,17,25,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>
    </span>
  </span>
)
import { broadcastMessage } from '@/lib/chat-broadcast'
import FilePickerButton from '@/components/FilePickerButton'
import PhoneUploadQR from '@/components/PhoneUploadQR'
import { useClickOutside } from '@/lib/use-click-outside'
import { useActiveCall, callMatches } from '@/lib/active-call'
import { getEffectiveEntitlements } from '@/lib/entitlements-client'
import { flagEnabled } from '@/lib/feature-flags'
import RecordSaleModal from '@/components/RecordSaleModal'
import Link from 'next/link'
import AiCallNote from '@/components/AiCallNote'
import { WaitlistNoteLine } from '@/components/AiAddedBadge'
import { isWaitlistNote, waitlistPreview } from '@/lib/waitlist-ai'
import CallCard from '@/components/CallCard'
import LiveCallBanner from '@/components/LiveCallBanner'
import DraftTasks from '@/components/DraftTasks'
import { latestChatMs, draftsCollapsed, todosGeneratedAt } from '@/lib/task-dedupe'
import Dialer from '@/components/Dialer'
import ResilientImage from '@/components/ResilientImage'
import ComposeMessage from '@/components/ComposeMessage'
import EmailMessage, { emailAttachmentKind, emailAttachmentUrl } from '@/components/EmailMessage'
import EmailComposer from '@/components/EmailComposer'
import ContactTimeline from '@/components/ContactTimeline'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import DeliveryPanel from '@/components/DeliveryPanel'
import MediaGallery, { MediaItem } from '@/components/MediaGallery'
import CustomerMatchCard from '@/components/CustomerMatchCard'
import StoryReplyPreview from '@/components/StoryReplyPreview'
import CustomerAddresses from '@/components/CustomerAddresses'
import DoaPanel from '@/components/DoaPanel'
import CreateOrderPanel from '@/components/CreateOrderPanel'
import SuperAdminContactWorkspaces from '@/components/SuperAdminContactWorkspaces'
import WaitlistQuickAdd from '@/components/WaitlistQuickAdd'
import { useAiDraft, AiDraftButton, AiDraftInfo } from '@/components/AiDraft'
import { useReplyTranslate, TranslateButton, TranslateStrip, customerLanguage } from '@/components/inbox/ReplyTranslate'
import { mightNeedTranslation } from '@/lib/call-languages'
import BookingLinkButton from '@/components/booking/BookingLinkButton'
import LinkCards, { linkCodesIn, useLinkStats, LastOpen } from '@/components/LinkCards'
import { confirmDialog } from '@/components/ConfirmDialog'
import RefundOrderModal from '@/components/RefundOrderModal'
import PrextyMark, { PREXTY } from '@/components/PrextyMark'
import { posSaleInfo, prextySpendIncGst } from '@/lib/prexty-pos'
import { notifyIntegrations } from '@/lib/integrations-notify'
import { isOldPhoneVideo } from '@/lib/web-video'
import { composerSubject } from '@/lib/email-subject'
import { threadHeaderLine } from '@/lib/thread-header'
import Popover, { useOneOpen } from '@/components/composer/Popover'
import ReviewRequestButton from '@/components/composer/ReviewRequestButton'
import { pickReviewChannel, REVIEW_REQUEST_SUBJECT, type ReviewChannel } from '@/lib/review-request'
import { fillTemplateVars, type TemplateVars } from '@/lib/composer-templates'
import WhatsAppComposerBar from '@/components/inbox/WhatsAppComposerBar'
import { STATUS_LABEL as WA_STATUS_LABEL } from '@/lib/whatsapp-core'
import { ProtectionCard, ProtectionBanner } from '@/components/inbox/ProtectionCard'
import EmptyScroll from '@/components/EmptyScroll'
import CustomerGlance from '@/components/inbox/CustomerGlance'
import { ColvyChatRow, ColvyChatThread, ColvyChatInfo, useColvySummary } from '@/components/inbox/ColvyChat'
import WidgetInstallCard from '@/components/inbox/WidgetInstallCard'

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
  email_attachments?: any[]
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
  realestate: 'RealEstate',
}

// Monochrome (currentColor) channel marks for the Send button, so the button
// itself shows WHERE the reply will land — Messenger, Instagram, SMS, email,
// WhatsApp, phone or live chat — instead of a generic arrow. They inherit the
// button's text colour (white when active, grey when disabled), matching the
// solid/gradient button background rather than the brand-coloured logos.
// Composer toolbar button: soft rounded square, icon only (tooltip via title).
const toolBtn = (on = false, tone?: { bg: string; c: string }): React.CSSProperties => ({
  width: 34, height: 34, borderRadius: 10, border: 'none', flexShrink: 0, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: tone ? tone.bg : on ? 'var(--peach)' : '#f3f4f6', color: tone ? tone.c : on ? 'var(--coral)' : '#6b7280',
})

const sendChannelGlyph = (ch: string, s = 15): React.ReactNode => {
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
// The status pill's icon, beside its colours.
const STATUS_ICON: Record<string, React.ReactNode> = {
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
let INBOX_HOUR12 = true
function timeOpts(): Intl.DateTimeFormatOptions {
  return INBOX_HOUR12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hour12: false }
}
function setInboxHour12(v: boolean) { INBOX_HOUR12 = v }

// Safe time formatter — handles null, undefined, and non-ISO timestamps
function fmtTime(d: string | undefined | null) {
  if (!d) return ''
  const s = typeof d === 'string' ? d : String(d)
  const parsed = parseTs(s)
  if (!parsed) return ''
  return parsed.toLocaleTimeString([], timeOpts())
}
// Formats like "Received 7:18 PM | 08 Jul | Instagram" / "Delivered 2:03 PM | 09 Jul"
function fmtReceipt(d: string | undefined | null, isAgent: boolean, channel?: string) {
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
function receiptChannel(msg: any, fallback?: string): string | undefined {
  if (Array.isArray(msg?.attachments) && msg.attachments.some((a: any) => a?.from_request)) return 'upload'
  // Customer emails received by the inbound webhook used to be saved without a
  // channel, so the column default ('chat') made them read "Live Chat".
  if (isEmailWithoutChannel(msg)) return 'email'
  // Written in someone's Colvy chat (Colvy's own inbox): say from which workspace.
  const ws = msg?.metadata?.colvy_app?.workspace_name
  if (msg?.delivery_channel === 'colvy' && ws) return `Colvy app · ${String(ws).slice(0, 60)}`
  return msg?.delivery_channel || fallback
}
function isEmailWithoutChannel(msg: any): boolean {
  const dc = String(msg?.delivery_channel || '').toLowerCase()
  return (!dc || dc === 'chat') && msg?.sender_type === 'visitor' && !!(msg?.email_message_id || msg?.email_in_reply_to)
}
// Two-letter initials from a name — first + last (e.g. "Bikiran Simkhada" → "BS")
// so team members whose first names share a letter stay distinguishable. A
// single-word name uses its first two letters.
function initialsOf(name?: string | null): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
// Interleave conversation events (assignments, channel switches, moves) into the
// message list in chronological order, so the thread reads like a real timeline.
function mergeEvents(msgs: any[], events: any[], calls: any[] = []) {
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
function tsOf(v: any): number {
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
const THREAD_PAGE = 150
// Last thread shown per conversation, so re-opening a chat (or coming back to
// the inbox) paints its messages instantly while the fresh copy loads. Small
// LRU — module scope survives client-side navigation like lib/client-cache.
const THREAD_CACHE_MAX = 30
const threadCache = new Map<string, { msgs: any[]; since: string | null }>()
function threadCacheGet(id: string) {
  const v = threadCache.get(id)
  if (v) { threadCache.delete(id); threadCache.set(id, v) }
  return v
}
function threadCacheSet(id: string, v: { msgs: any[]; since: string | null }) {
  threadCache.delete(id)
  threadCache.set(id, v)
  while (threadCache.size > THREAD_CACHE_MAX) {
    const oldest = threadCache.keys().next().value
    if (oldest === undefined) break
    threadCache.delete(oldest)
  }
}
// Run async jobs with bounded concurrency (instead of one-at-a-time awaits).
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Render `text` with every (case-insensitive) occurrence of `q` wrapped in a
// <mark>, so a search result shows exactly what matched. With no query it just
// returns the text unchanged. The highlight is a translucent tint of the theme
// accent (the company's brand colour, coral by default) so it reads correctly
// in both light and dark mode instead of a fixed amber.
function Highlight({ text, q, accent = 'var(--coral)' }: { text: string; q: string; accent?: string }) {
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
function makeSnippet(text: string, q: string): string {
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
function LifecycleIcon({ kind }: { kind: string }) {
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
type CallKind = 'missed' | 'received' | 'outgoing' | 'voicemail'
function callGlyphKind(text?: string | null): CallKind | null {
  const s = String(text || '').toLowerCase()
  if (!/📞|☎|voicemail|missed call|call received|incoming call|call ended|call answered|outgoing call|outbound call/.test(s)) return null
  if (/voicemail/.test(s)) return 'voicemail'
  if (/missed/.test(s)) return 'missed'
  if (/received|incoming|answered/.test(s)) return 'received'
  if (/ended|outgoing|outbound|made/.test(s)) return 'outgoing'
  return 'received'
}
const stripCallEmoji = (t?: string | null) => String(t || '').replace(/^\s*(?:📞|☎️?|📵)\s*/, '')
function CallGlyph({ kind }: { kind: CallKind }) {
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
const PAYMENT_SIGNAL_PHRASES = [
  'i have paid', "i've paid", 'ive paid', 'just paid', 'paid the invoice', 'invoice paid',
  'payment sent', 'sent the payment', 'sent payment', 'sent you the payment', 'made the payment',
  'made payment', 'bank transfer', 'transferred the', 'transferred it', 'sent the money',
  'paid via', 'payment done', 'paid it', 'paid now', 'have paid', 'thank you for the payment',
  'thanks for the payment', 'thanks for your payment', 'receipt attached', 'uploaded the receipt',
  'sent the receipt', 'sent you the receipt', 'here is the receipt', "here's the receipt",
  'deposited', 'e-transfer', 'etransfer', 'payment made',
]

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InboxPage() {
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
    try {
      window.dispatchEvent(new CustomEvent('colvy:ai-context', {
        detail: { conversationId: selected?.id || null, contactId: (selected as any)?.contact_id || null },
      }))
    } catch {}
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
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
    finally { setProductSearching(false) }
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

    const [ctsRes, candRes] = await Promise.all([
      contactIds.length
        ? (supabase as any).from('contacts').select('id, name, email, phone, relationship_type, prexty_customer_id').in('id', contactIds)
        : Promise.resolve(null),
      unlinked.length
        ? (supabase as any).from('contacts').select('id, name, email, phone, relationship_type').eq('company_id', id)
            .or(tails.map((t: string) => `phone.ilike.%${t}%`).join(',')).limit(200)
        : Promise.resolve(null),
    ])

    if (contactIds.length) {
      const byId: Record<string, any> = {}
      for (const ct of ctsRes?.data || []) byId[ct.id] = ct
      for (const c of convs) (c as any).contacts = c.contact_id ? byId[c.contact_id] || null : null
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
    if (typeof window === 'undefined') return
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
      if (conv.contact_id) {
        const { data: ct } = await (supabase as any).from('contacts').select('id, name, email, phone, relationship_type, prexty_customer_id').eq('id', conv.contact_id).maybeSingle()
        if (ct) (conv as any).contacts = ct
      }
      setConversations(prev => prev.some(c => c.id === conv.id) ? prev : [conv, ...prev])
      selectConversation(conv)
    })()
  }, [conversations, selected])

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
      const { data: ct } = await (supabase as any).from('contacts')
        .select('id, name, email, phone, relationship_type, prexty_customer_id').eq('id', contactId).maybeSingle()
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
        setConversations(prev => prev.map(c => c.id === conv.id ? ({ ...c, contact_id: matched.id, contacts: matched } as any) : c))
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
      {notes.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No notes.</p>}
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
      {tasks.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 8px' }}>No tasks.</p>}
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
      alert('Could not mark the order completed: ' + e.message)
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
                  <div className="cmp-mode" role="tablist" aria-label="Reply or internal note">
                    <span className="cmp-mode-thumb" style={{ transform: internalMode ? 'translateX(100%)' : 'none' }} />
                    <button type="button" role="tab" aria-selected={!internalMode} onClick={() => setInternalMode(false)}>Reply</button>
                    <button type="button" role="tab" aria-selected={internalMode} onClick={() => setInternalMode(true)}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
                      Note
                    </button>
                  </div>
                  <span className="cmp-via">
                    {internalMode ? 'Only your team sees this' : channelResolving ? 'Choosing a channel…' : <><span className="cmp-via-lbl">Sending by </span><b>{({ sms: 'SMS', email: 'email', chat: 'live chat', instagram: 'Instagram', messenger: 'Messenger', whatsapp: 'WhatsApp', call: 'SMS', colvy: 'Colvy app' } as Record<string, string>)[sendChannel !== 'auto' ? sendChannel : outboundChannel] || 'chat'}</b> {sendChannelGlyph(sendChannel !== 'auto' ? sendChannel : outboundChannel, 13)}</>}
                    {/* Both a mobile and an email: one tap to the other. */}
                    {!internalMode && !channelResolving && (() => {
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
                    <Popover open={showSendMenu} onClose={() => setShowSendMenu(false)} anchorRef={sendMenuRef} width={220} prefer="top" label="More actions" role="menu" padding={0}>
                      <div className="cmp-send-menu" style={{ padding: '4px 0' }}>
                        {[['poll', Icon.poll(), 'Send Poll'], ['survey', Icon.survey(), 'Send Survey'], ['form', Icon.form(), 'Send Form']].map(([k, icon, label]: any) => (
                          <button key={k} type="button" role="menuitem" data-pop-item onClick={() => { pickerInsertRef.current = insert || null; openPicker(k as any) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}><span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{icon}</span>{label}</button>
                        ))}

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        <button type="button" role="menuitem" data-pop-item onClick={() => { pickerInsertRef.current = insert || null; openPicker('payment' as any) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{Icon.payment()}</span>Send Payment Link
                        </button>

                        <button type="button" role="menuitem" data-pop-item onClick={() => { setShowSendMenu(false); setShowChargeCard(true); if (!cardsByConv.current.has(selected?.id || '')) loadSavedCards() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                          </span>Charge Card
                        </button>

                        <button type="button" role="menuitem" data-pop-item onClick={() => { setShowSendMenu(false); openSchedule() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                          </span>Schedule delivery
                        </button>

                        <button type="button" role="menuitem" data-pop-item onClick={() => { setShowSendMenu(false); saveCard() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/><path d="M16 15h3"/></svg>
                          </span>Save Card
                        </button>

                        <div style={{ borderTop: '1px solid var(--border)' }} />

                        {!forEmail && (<>
                        <button type="button" role="menuitem" data-pop-item onClick={() => { setShowSendMenu(false); if (!voiceUploading) startVoiceNote() }} disabled={voiceUploading || recording}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg></span>Record voice note
                        </button>
                        <button type="button" role="menuitem" data-pop-item onClick={() => { setShowSendMenu(false); setShowInboxQR(true) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg></span>Upload from your phone
                        </button>
                        </>)}
                        <button type="button" role="menuitem" data-pop-item onClick={() => { setShowSendMenu(false); setShowMediaRequest(true) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--slate)', display: 'inline-flex' }}>{Icon.media(15)}</span>Request Media
                        </button>
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
                    <Popover open={showShortener} onClose={() => { setShowShortener(false); setShortenError('') }} anchorRef={shortenerAnchorRef} width={320} prefer="top" label="Create short URL" padding={12}>
                        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Create short URL</p>
                        <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.4 }}>
                          Paste a long URL — it becomes a short link on your own domain and records clicks.
                        </p>
                        <input value={shortenInput} onChange={e => setShortenInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); shortenIntoReply(insert) } }}
                          placeholder="https://roxyaquarium.com.au/..." data-autofocus
                          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box' }} />
                        {shortenError && <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#dc2626' }}>{shortenError}</p>}
                        <div style={{ display: 'flex', gap: 6, marginTop: 9 }}>
                          <button type="button" onClick={() => shortenIntoReply(insert)} disabled={shortenBusy || !shortenInput.trim()}
                            style={{ flex: 1, padding: '7px 12px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', opacity: shortenBusy || !shortenInput.trim() ? 0.5 : 1 }}>
                            {shortenBusy ? 'Shortening…' : 'Shorten & insert'}
                          </button>
                          <button type="button" onClick={() => { setShowShortener(false); setShortenInput(''); setShortenError('') }}
                            style={{ padding: '7px 12px', borderRadius: 8, background: '#fff', border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: 'var(--slate)' }}>
                            Cancel
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

  const miniBtn = (color: string): React.CSSProperties => ({ fontSize: 11.5, fontWeight: 600, color, background: '#fff', border: '1.5px solid #e4e4e7', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' })

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
      setShowTicketPanel(false)
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
      if (!res.ok) { alert(data.error || 'Could not create payment'); return }
      if (!isWidgetActive) {
        if (!data.checkoutUrl) { alert('Could not make the payment link'); return }
        const text = `Payment request: $${parseFloat(payAmount).toFixed(2)} AUD${payDesc ? ` — ${payDesc}` : ''}\nPay securely: ${data.checkoutUrl}`
        const insert = pickerInsertRef.current
        if (insert) insert(text)
        else setReply(r => (r.trim() ? r.trimEnd() + '\n\n' : '') + text)
        pickerInsertRef.current = null
        showToast('Payment link added to your reply. Check it, then press Send.')
      }
      setSendPicker(null); setPayAmount(''); setPayDesc(''); setPayAddress(null)
      if (isWidgetActive && await reloadThread(selected.id)) scrollBottom()
    } catch (e: any) { alert('Payment error: ' + e.message) }
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
          const { data: cts } = await (supabase as any).from('contacts')
            .select('id, name, email, phone, relationship_type').in('id', cids)
          const byId: Record<string, any> = {}
          for (const ct of cts || []) byId[ct.id] = ct
          for (const r of rows) (r as any).contacts = r.contact_id ? byId[r.contact_id] || null : null
        }
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
        alert('Could not save the internal note: ' + e.message)
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
      if (stagedMedia.length) { setSending(false); alert('Files can’t be sent in the Colvy chat yet. Paste a link instead.'); return }
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
        alert('Could not send: ' + e.message)
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
      delivery_channel: 'chat',
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
            .select('id').eq('company_id', companyId)
            .or(`name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`).limit(500)
          const cids = (cts || []).map((c: any) => c.id).filter(Boolean)
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
          const { data: cts } = await (supabase as any).from('contacts')
            .select('id, name, email, phone').in('id', cids)
          const byId: Record<string, any> = {}
          for (const ct of cts || []) byId[ct.id] = ct
          for (const c of extra) (c as any).contacts = c.contact_id ? byId[c.contact_id] || null : null
        }
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
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--slate)' }}>Loading inbox…</div>

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

  return (
    <div className={`inbox-root inbox-pane-${mobilePane}${tabletContact ? ' tablet-contact-open' : ''}`} style={{ display: 'flex', height: '100vh', maxHeight: 'calc(100vh - 56px - var(--admin-banners-h, 0px))', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <style>{`
        .sched-btn { display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 11px; border-radius: 8px; border: 1px solid var(--border); background: #fff; color: var(--ink); font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; transition: background .15s ease, border-color .15s ease, color .15s ease; }
        .sched-btn:hover:not(:disabled) { background: var(--canvas, #fafafa); }
        .sched-btn.primary { background: var(--coral); border-color: var(--coral); color: #fff; }
        .sched-btn.primary:hover:not(:disabled) { background: var(--coral); filter: brightness(0.95); }
        .sched-btn.icon { width: 30px; padding: 0; justify-content: center; color: var(--slate); }
        .sched-btn.icon:hover:not(:disabled) { color: #dc2626; border-color: #fecaca; background: #fef2f2; }
        .sched-btn:disabled { cursor: default; }
        /* Composer resize grip: reveal the "drag to resize" pill on hover. */
        .composer-grip:hover .composer-grip-pill { opacity: 1 !important; transform: translateY(0) !important; }
        .composer-grip::before {
          content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
          width: 44px; height: 4px; border-radius: 999px; background: var(--border);
          opacity: 0; transition: opacity .12s ease;
        }
        .composer-grip:hover::before { opacity: 1; }

        /* The collapsed one-line reply bar is a phone thing only. */
        .mcmp-bar { display: none; }

        /* Keyboard keys in the empty thread pane. */
        .inbox-kbd { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 6px; background: #fff; border: 1px solid #e5e5ea; box-shadow: 0 1px 0 rgba(0,0,0,0.04); font-size: 11.5px; font-weight: 600; color: #3a3a3c; }
        @media (hover: none), (max-width: 1100px) { .inbox-kbd-hints { display: none !important; } }

        /* Desktop: the list, the thread and the contact panel float as rounded
           cards on a soft grey, like a native app. The thread column keeps its
           menus unclipped, so its header and reply box take the corners. */
        @media (min-width: 1101px) {
          .inbox-root { background: #f1f1f4; padding: 10px; gap: 10px; }
          .inbox-col-list, .inbox-col-contact, .inbox-collapsed-rail { border: none !important; border-radius: 18px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
          .inbox-col-thread { border-radius: 18px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
          .inbox-col-thread > .inbox-thread-header { border-radius: 18px 18px 0 0; }
          .inbox-col-thread .inbox-composer { border-radius: 0 0 18px 18px; }
          .inbox-empty-thread { border-radius: 18px; }
        }

        /* A message that has just arrived (or just been sent) rises into place
           from its own corner; what was already there when the thread opened
           stays still. */
        .chat-msg-row.msg-in { animation: msgIn .4s cubic-bezier(.2,.9,.3,1.12) both; transform-origin: bottom left; }
        .chat-msg-row.msg-in.mine { transform-origin: bottom right; }
        @keyframes msgIn { from { opacity: 0; transform: translateY(10px) scale(.96); } to { opacity: 1; transform: none; } }

        /* ── Inbox mobile responsiveness ─────────────────────────────── */
        @media (max-width: 767px) {
          /* Fit the inbox between the top header AND the fixed bottom nav — the
             old height only subtracted the 56px header, so the composer / Send
             row (and the mobile back button's pane) sat behind the bottom nav.
             dvh tracks the mobile browser chrome so the top isn't pushed off. */
          .inbox-root {
            height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
          }
          /* Keyboard up (components/KeyboardAware): the page has shrunk to the
             space above it and the bottom tabs and banners have stepped aside,
             so the inbox takes everything under the top bar. While writing an
             email the customer strip and the To row (still under Details when
             the keyboard is down) give way, and the editor starts shorter. */
          html.kb-open .inbox-root {
            height: calc(100dvh - 56px - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - var(--admin-banners-h, 0px)) !important;
          }
          html.kb-open .cg-wrap { display: none; }
          html.kb-open .ecmp:has(.email-rte:focus) .ecmp-to { display: none !important; }
          html.kb-open .email-rte { min-height: 72px !important; max-height: 30dvh !important; }
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

          /* Row 1 is one tidy line: back · avatar · name · call · contact · ⋯.
             The name truncates; nothing is pushed off the right edge. Every
             other control lives in a tray (row 2+) that the ⋯ button opens,
             wrapping onto as many lines as it needs, so nothing is cut off
             and nothing scrolls sideways. The tools container dissolves
             (display: contents) so its buttons wrap alongside Pin, Assign and
             the actions menu; desktop keeps its own layout untouched. */
          .inbox-thread-header { padding-bottom: 6px !important; row-gap: 6px !important; }
          .inbox-thread-header .inbox-back-label { display: none; }
          .inbox-thread-header .inbox-mobile-only:first-child { width: 36px; padding: 0 !important; justify-content: center; }
          .inbox-thread-header .inbox-call-label { display: none; }
          .inbox-thread-header [data-callbar-btn] { width: 36px; height: 36px; padding: 0 !important; justify-content: center; flex-shrink: 0; }
          .inbox-thread-header .inbox-m-more { width: 36px !important; height: 36px !important; }
          .inbox-thread-header .inbox-header-tools,
          .inbox-thread-header .inbox-pin-btn,
          .inbox-thread-header .inbox-status-pill,
          .inbox-thread-header [data-assign-menu],
          .inbox-thread-header [data-actions-menu] { display: none !important; }
          .inbox-thread-header.m-tools-open { padding-bottom: 8px !important; }
          .inbox-thread-header.m-tools-open .inbox-m-break { display: block !important; order: 9; flex: 0 0 100%; height: 0; }
          .inbox-thread-header.m-tools-open .inbox-header-tools { display: contents !important; }
          /* The tray: status and who has it on one line, the tools on the next. */
          .inbox-thread-header.m-tools-open .inbox-status-pill { display: inline-flex !important; order: 10; }
          .inbox-thread-header.m-tools-open [data-assign-menu] { display: block !important; order: 11; }
          .inbox-thread-header.m-tools-open .inbox-header-tools::before { content: ''; order: 12; flex: 0 0 100%; height: 0; }
          .inbox-thread-header.m-tools-open .inbox-header-tools > * { order: 13 !important; flex-shrink: 0; }
          .inbox-thread-header.m-tools-open .inbox-pin-btn { display: flex !important; order: 13; width: 36px !important; height: 36px !important; }
          .inbox-thread-header.m-tools-open [data-actions-menu] { display: block !important; order: 13; }
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

          /* Tray dropdowns (Assign, ⋯, outlets) open full-width under the
             header rather than off the edge of a narrow screen. */
          .inbox-thread-header [data-assign-menu],
          .inbox-thread-header [data-actions-menu],
          .inbox-thread-header [data-move-menu] { position: static !important; }
          .inbox-thread-header [data-assign-menu] > button { min-height: 36px; padding: 6px 12px !important; }
          .inbox-thread-header [data-actions-menu] > button { min-width: 36px; min-height: 36px; }
          .inbox-thread-header [data-assign-menu] > div,
          .inbox-thread-header [data-actions-menu] > div,
          .inbox-thread-header [data-move-menu] > div {
            top: calc(100% + 4px) !important; left: 8px !important; right: 8px !important;
            width: auto !important; max-width: none !important; z-index: 200;
          }

          /* ── Native-app feel ───────────────────────────────────────────────
             The pane switching above already gives a phone layout; these make it
             behave like an installed app rather than a website in a browser. */

          /* Fill the real visible viewport. 100vh on iOS Safari includes the
             address bar, so the composer sat below the fold; dvh tracks the
             browser chrome as it hides and shows. */
          /* …minus the app header and the bottom tab bar, which both stay on
             screen; a bare 100dvh ran ~115px under the tab bar, so the reply
             box hid behind it until you scrolled. */
          .inbox-root {
            height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
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
          .sched-list .sched-btn { min-height: 34px; }
          /* Attachment tiles keep a round remove button (a bit larger for a thumb). */
          .inbox-composer .staged-strip button { min-height: 0; width: 24px !important; height: 24px !important; }

          /* Slimmer composer on a phone: the reply box was a fixed 3 rows, which
             ate a big chunk of the screen even when empty. Start at ~2 rows and
             let it grow up to 40dvh as they type; tighten the surrounding gaps. */
          .inbox-composer { padding: 8px 12px !important; }
          .inbox-composer textarea {
            min-height: 52px !important;
            height: 52px !important;
            max-height: 40dvh;
            line-height: 1.35;
            margin-bottom: 6px !important;
          }

          /* Conversation rows: full-width tap target with a pressed state. */
          .inbox-col-list button:active { background: var(--peach) !important; }

          /* Contact panel opens as a full sheet rather than a cramped column. */
          .inbox-pane-contact .inbox-col-contact {
            padding-bottom: max(12px, env(safe-area-inset-bottom)) !important;
          }

          /* ── Composer on a phone ───────────────────────────────────────────
             The toolbar carried ~8 controls (note, resolve, short link, emoji,
             quick replies, attach, save card, send menu) in a fixed row. On a
             narrow screen they collided with the Send button and several were
             unreachable. Two changes fix it without hiding anything:
             the tools scroll horizontally on their own line, and Send gets a
             full-width line beneath so it's never squeezed. */
          .inbox-composer .composer-bar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 8px !important;
          }
          .inbox-composer .composer-tools {
            gap: 6px !important;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            padding-bottom: 2px;
          }
          .inbox-composer .composer-tools::-webkit-scrollbar { display: none; }
          /* Controls keep their size instead of being crushed to fit. */
          .inbox-composer .composer-tools > * { flex-shrink: 0; }
          .inbox-composer .composer-tools button {
            min-width: 38px;
            min-height: 38px;
          }

          /* Send row: full width, thumb-sized. */
          .inbox-composer .composer-bar > div:last-child {
            display: flex !important;
            gap: 8px !important;
          }
          .inbox-composer .composer-bar > div:last-child > button,
          .inbox-composer .composer-bar > div:last-child > div {
            flex: 1;
          }
          /* …except the round AI / resolve buttons beside Send. */
          .inbox-composer .composer-bar > .cmp-send > .cmp-tool,
          .inbox-composer .composer-bar > .cmp-send > .ai-orb { flex: 0 0 auto !important; width: 44px !important; }
          .inbox-composer .cmp-tools { flex-wrap: nowrap; }
          .inbox-composer .cmp-hint { display: none; }
          .inbox-composer .cmp-mode button { min-height: 0 !important; }
          .inbox-composer .composer-bar > div:last-child button {
            min-height: 44px;
            font-size: 14px !important;
          }

          /* Dropdowns must escape the scrolling strip, or they'd be clipped. */
          .inbox-composer .composer-tools [style*="position: absolute"],
          .inbox-composer .composer-tools > div > div { z-index: 120; }

          /* The thread header's own tool strip: same treatment, and drop the
             text labels so the icons alone fit across a phone. */
          .inbox-thread-header .inbox-header-tools button span.tool-label { display: none; }

          /* Message bubbles get more of the screen — 70% left too much dead
             space on a 390px phone. Replies sit against the right edge (no
             business avatar beside your own messages, like iMessage). */
          .inbox-messages .chat-msg-col { max-width: 84% !important; min-width: 0; }
          .inbox-messages .chat-agent-av { display: none !important; }
          .inbox-messages .chat-cust-av { width: 24px !important; height: 24px !important; font-size: 10px !important; }
          .inbox-messages { padding: 10px 12px !important; gap: 7px !important; }
          /* Flatter, less bulky bubbles on a phone. */
          .inbox-messages .msg-bubble { box-shadow: 0 1px 2px rgba(0,0,0,0.05) !important; }
          .inbox-messages .msg-bubble p { line-height: 1.4 !important; }

          /* ── Thread first ──────────────────────────────────────────────────
             The full email composer (From/To/Subject/Signature/toolbar) used
             to open on every thread and took the whole screen, squashing the
             messages to a sliver. On a phone the composer now starts as a
             one-line bar; tapping it opens the composer, capped at about two
             thirds of the height so the thread stays visible above it. The
             desktop drag-resize grip and its remembered height don't apply. */
          .inbox-messages { min-height: 0; }
          .inbox-composer .composer-grip { display: none !important; }
          .inbox-composer { flex-shrink: 0; }
          .inbox-composer.mcmp-collapsed { padding: 8px 10px !important; }
          .inbox-composer.mcmp-collapsed > :not(.mcmp-bar) { display: none !important; }
          .inbox-composer.mcmp-collapsed .mcmp-bar { display: flex; align-items: center; gap: 8px; }
          .inbox-composer.mcmp-open { max-height: 66%; overflow-y: auto; overscroll-behavior: contain; }
          .inbox-composer.mcmp-open .mcmp-bar { display: none !important; }
          .inbox-composer .cmp-head { gap: 8px; padding: 8px 10px 2px; }
          .inbox-composer .cmp-via { margin-left: auto; min-width: 0; flex: 0 1 auto; }
          .inbox-composer .cmp-via-lbl { display: none; }
          .inbox-composer .cmp-mode button { padding: 0 12px; }
          .mcmp-reply {
            flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px;
            height: 44px; min-height: 44px !important; padding: 0 12px 0 6px; border: 1px solid var(--border); border-radius: 14px;
            background: #f8f9fb; color: var(--slate); font: inherit; font-size: 14px; text-align: left; cursor: text;
          }
          .mcmp-reply.note { background: #fffbeb; border-color: #fcd34d; }
          .mcmp-ch {
            display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; height: 30px; padding: 0 9px;
            border-radius: 10px; background: #fff; border: 1px solid var(--border); color: var(--ink);
            font-size: 12px; font-weight: 700;
          }
          .mcmp-reply.note .mcmp-ch { color: #b45309; border-color: #fcd34d; }
          .mcmp-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .mcmp-text.has-draft { color: var(--ink); }
          .mcmp-text b { color: var(--coral); font-weight: 700; }
          .mcmp-note {
            flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; height: 44px; min-height: 44px !important; padding: 0 12px;
            border-radius: 14px; border: 1px solid var(--border); background: #fff; color: var(--slate);
            font: inherit; font-size: 13px; font-weight: 700; cursor: pointer;
          }
          .mcmp-note.on { color: var(--ink); }
          /* The Colvy AI orb never sits on the composer: it steps aside while
             the composer is open, and rests just above the collapsed bar. */
          html body:has(.inbox-pane-thread .inbox-composer.mcmp-open) .colvy-ai-orb-wrap { display: none !important; }
          html body:has(.inbox-pane-thread .inbox-composer.mcmp-collapsed) .colvy-ai-orb-wrap[data-default-pos] { bottom: calc(58px + env(safe-area-inset-bottom, 0px) + 76px) !important; }
        }
        /* The conversation header, like Sellio's: a tinted status pill, who
           it's assigned to, then plain round icons that only show a
           background on hover. Its menus are soft white cards. */
        .th-btn { position: relative; width: 36px; height: 36px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: transparent; color: #52525b; cursor: pointer; transition: background .15s ease, color .15s ease, transform .1s ease; }
        .th-btn:hover { background: #f4f4f5; color: #18181b; }
        .th-btn:active { transform: scale(.93); }
        .th-btn.on { background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); }
        .th-btn:focus-visible, .th-pill:focus-visible, .th-menu-row:focus-visible, .th-mood:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .th-dial { color: #059669; }
        .th-dial:hover { background: #ecfdf3; color: #047857; }
        .th-ai { color: #8b5cf6; }
        .th-ai:hover { background: #f5f3ff; color: #7c3aed; }
        .th-ai.off { color: #a1a1aa; }
        .th-ai-slash { position: absolute; width: 20px; height: 1.8px; border-radius: 1px; background: #ef4444; transform: rotate(-45deg); }
        .th-pill { height: 36px; flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 0 15px; border: none; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 650; white-space: nowrap; cursor: pointer; transition: background .15s ease, transform .1s ease; }
        .th-pill:active { transform: scale(.97); }
        .th-call { background: #ecfdf3; color: #067647; }
        .th-call:hover { background: #d1fadf; }
        .th-assign { background: transparent; color: #18181b; padding: 0 12px 0 4px; font-weight: 600; }
        .th-assign.none { width: 36px; padding: 0; justify-content: center; background: #f4f4f5; color: #3f3f46; }
        .th-assign:hover, .th-assign.on { background: #f4f4f5; }
        .th-assign.none:hover, .th-assign.none.on { background: #ececef; }
        .th-assign-name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
        .th-av { width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--coral) 14%, #fff); color: var(--coral); font-size: 12.5px; font-weight: 700; }
        .th-av.sm { width: 26px; height: 26px; font-size: 12px; }
        .th-status { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; color: var(--st-fg); }
        .th-status select { field-sizing: content; appearance: none; -webkit-appearance: none; height: 36px; margin: 0; padding: 0 32px 0 35px; border: none; border-radius: 999px; background: var(--st-bg); color: var(--st-fg); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; transition: filter .15s ease; }
        .th-status select:hover { filter: brightness(.97); }
        .th-status select:focus-visible { outline: 2px solid var(--st-fg); outline-offset: 2px; }
        .th-status-ic { position: absolute; left: 13px; display: flex; pointer-events: none; }
        .th-status-chev { position: absolute; right: 12px; pointer-events: none; }
        .th-menu { z-index: 50; padding: 6px; border-radius: 16px; background: #fff; box-shadow: 0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05); transform-origin: top right; animation: thMenuIn .18s cubic-bezier(.22,1,.36,1); }
        @keyframes thMenuIn { from { opacity: 0; transform: translateY(-4px) scale(.98); } to { opacity: 1; transform: none; } }
        .th-menu-search { width: 100%; box-sizing: border-box; height: 40px; margin: 0 0 4px; padding: 0 30px 0 12px; border-radius: 12px; border: 1.5px solid #e4e4e7; background: #fff; font: inherit; font-size: 14px; color: #111; outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
        .th-menu-search:focus { border-color: var(--coral); box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .th-menu-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 10px; background: none; font: inherit; font-size: 14px; color: #18181b; text-align: left; cursor: pointer; }
        .th-menu-row:hover { background: #f4f4f5; }
        .th-menu-row.cur { font-weight: 650; }
        .th-menu-row.danger { color: #dc2626; }
        .th-menu-row > svg { color: #71717a; flex-shrink: 0; }
        .th-menu-sep { height: 1px; margin: 4px 6px; background: #f0f0f2; }
        .th-menu-label { margin: 6px 10px 4px; font-size: 12.5px; font-weight: 500; color: #8e8e93; }
        .th-mood { flex: 1; height: 38px; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 10px; background: #f4f4f5; color: #71717a; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .th-mood:hover { color: var(--mood); }
        .th-mood.on { background: color-mix(in srgb, var(--mood) 14%, #fff); color: var(--mood); }
        /* The contact panel, in the same style: pill tabs, a tinted Action
           pill, small pill buttons. */
        .cp-tabs { display: flex; gap: 2px; margin: 12px 14px 0; padding: 3px; border-radius: 999px; background: #f4f4f5; flex-shrink: 0; }
        .cp-tab { flex: 1; height: 32px; border: none; border-radius: 999px; background: transparent; font: inherit; font-size: 13px; font-weight: 600; color: #71717a; cursor: pointer; white-space: nowrap; transition: background .18s ease, color .15s ease, box-shadow .18s ease; }
        .cp-tab:hover { color: #18181b; }
        .cp-tab:hover { background: transparent; }
        .cp-tab.on, .cp-tab.on:hover { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04); }
        .cp-tab:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .cp-action { width: 100%; height: 40px; display: flex; align-items: center; justify-content: center; gap: 6px; border: none; border-radius: 999px; background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; transition: background .15s ease, transform .1s ease; }
        .cp-action:hover, .cp-action.on { background: color-mix(in srgb, var(--coral) 18%, #fff); }
        .cp-action:active { transform: scale(.98); }
        .cp-action:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
        .cp-act-row > span:first-child { color: var(--coral); display: inline-flex; }
        .cp-mini { height: 28px; padding: 0 12px; display: inline-flex; align-items: center; gap: 5px; border: none; border-radius: 999px; background: #f4f4f5; color: #3f3f46; font: inherit; font-size: 12.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease; }
        .cp-mini:hover { background: #ececef; }
        .cp-mini.accent { background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); }
        .cp-mini.accent:hover { background: color-mix(in srgb, var(--coral) 18%, #fff); }
        .cp-mini.violet { background: #f5f3ff; color: #7c3aed; }
        .cp-mini.violet:hover { background: #ede9fe; }
        .cp-mini:disabled { opacity: .6; cursor: default; }
        .inbox-col-contact button[style*="border-radius: 999px"]:not(:disabled):hover, .inbox-col-contact a[style*="border-radius: 999px"]:hover { filter: brightness(.97); }
        /* The conversation list's controls, like Sellio's: borderless pill
           chips (the chosen one dark), a grey location pill, a status menu
           and a round filter icon. */
        .il-chip { flex-shrink: 0; height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
        .il-chip:hover { background: #ececef; color: #18181b; }
        .il-chip.on { background: #18181b; color: #fff; }
        .il-chip:focus-visible, .il-status:focus-visible, .il-loc:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .il-chip-n { min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: color-mix(in srgb, var(--coral) 14%, #fff); color: var(--coral); }
        .il-chip.on .il-chip-n { background: rgba(255,255,255,.18); color: #fff; }
        .il-search { width: 100%; box-sizing: border-box; height: 38px; padding: 0 14px 0 38px; border: 1.5px solid transparent; border-radius: 999px; background: #f4f4f5; font: inherit; font-size: 14px; color: #111; outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
        .il-search::placeholder { color: #a1a1aa; }
        .il-search:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .il-loc { width: 100%; height: 36px; padding: 0 34px 0 36px; border: none; border-radius: 999px; background: #f4f4f5; font: inherit; font-size: 13.5px; font-weight: 600; color: #18181b; cursor: pointer; appearance: none; -webkit-appearance: none; transition: background .15s ease; }
        .il-loc:hover { background: #ececef; }
        .il-loc.on { background: color-mix(in srgb, var(--coral) 12%, #fff); color: var(--coral); }
        .il-status { height: 32px; display: inline-flex; align-items: center; gap: 7px; padding: 0 11px 0 10px; border: none; border-radius: 999px; background: transparent; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; transition: background .15s ease; }
        .il-status svg:first-child { color: #52525b; }
        .il-status:hover, .il-status.on { background: #f4f4f5; }
        .il-badge { position: absolute; top: -2px; right: -2px; min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box; border-radius: 8px; border: 2px solid #fff; background: var(--coral); color: #fff; font-size: 9.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
        .cp-hint { margin-top: 8px; width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: none; border-radius: 12px; background: #f6f6f7; font: inherit; font-size: 13px; color: #52525b; text-align: left; cursor: pointer; transition: background .15s ease; }
        .cp-hint:hover { background: #efeff1; }
        .cp-hint-ic { display: inline-flex; color: var(--coral); flex-shrink: 0; }
        /* Conversation tags, like Sellio's: a dot and the label in its colour,
           on a soft tint of it. */
        .cv-tag { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--tag) 9%, #fff); color: color-mix(in srgb, var(--tag) 88%, #000); font-size: 12px; font-weight: 600; line-height: 1; white-space: nowrap; }
        .cv-tag-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tag); flex-shrink: 0; }
        .cv-tag-dot.live { animation: livePulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .th-menu { animation: none; } }
        /* Desktop / tablet: the tools sit inline on the right as before */
        @media (min-width: 768px) {
          .inbox-header-tools { display: flex; align-items: center; gap: 2px; }
        }
        /* Narrow desktop windows: tighten so nothing falls off */
        @media (min-width: 768px) and (max-width: 1100px) {
          .inbox-thread-header { gap: 7px !important; padding: 10px 12px !important; }
          .inbox-header-tools { gap: 0 !important; }
        }
        @media (min-width: 768px) {
          .inbox-mobile-only { display: none !important; }
        }
        /* Tablets: the conversation gets the room; contact details slide in
           from the right on demand instead of taking a fixed 280px column. */
        .inbox-tablet-scrim { display: none; }
        @media (min-width: 768px) and (max-width: 1100px) {
          .inbox-tablet-only { display: flex !important; }
          .inbox-root .inbox-col-contact {
            position: fixed !important; top: 56px; right: 0; bottom: 0; z-index: 320;
            width: min(360px, 88vw) !important; border-left: 1px solid var(--border);
            box-shadow: -24px 0 48px -24px rgba(16,24,40,.35);
            transform: translate3d(105%,0,0); transition: transform .32s cubic-bezier(.22,1,.36,1);
            visibility: hidden;
          }
          .inbox-root.tablet-contact-open .inbox-col-contact { transform: none; visibility: visible; }
          .inbox-root.tablet-contact-open .inbox-tablet-scrim {
            display: block; position: fixed; inset: 56px 0 0 0; z-index: 310;
            background: rgba(17,24,39,.22); animation: tabletScrimIn .25s ease both;
          }
          .inbox-root .inbox-col-contact > .cp-tabs { margin-right: 48px; }
          @keyframes tabletScrimIn { from { opacity: 0 } to { opacity: 1 } }
        }
        @media (min-width: 768px) and (max-width: 860px) {
          /* the bottom tab bar is still showing at this width — leave room for it */
          .inbox-root {
            height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
            max-height: calc(100dvh - 56px - 58px - env(safe-area-inset-bottom, 0px) - var(--admin-banners-h, 0px)) !important;
          }
          .inbox-root .inbox-col-contact { bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
          .inbox-root.tablet-contact-open .inbox-tablet-scrim { bottom: calc(58px + env(safe-area-inset-bottom, 0px)); }
        }
        @media (prefers-reduced-motion: reduce) {
          .inbox-root .inbox-col-contact { transition: none !important; }
        }
      `}</style>
      {/* IncomingCallListener now lives in the admin layout, so calls ring on
          EVERY admin page — not only here. Mounting it twice would register two
          clients on the same credential. */}

      {/* Conversation action panels */}
      <style>{`
        @keyframes doaSlideIn { from { transform: translate(100%, -50%); } to { transform: translate(0, -50%); } }
        @keyframes typingDot { 0%, 60%, 100% { opacity: 0.25; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes recPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes livePulse { 0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(34,197,94,0.6); } 50% { opacity: 0.6; box-shadow: 0 0 0 4px rgba(34,197,94,0); } }
        .ai-spark:hover .ai-tip { opacity: 1 !important; }
        /* Hide the assignment-strip scrollbar on every screen size — the chevron
           buttons drive scrolling now, so the raw grey scrollbar isn't wanted. */
        .inbox-assign-tabs { scrollbar-width: none; -ms-overflow-style: none; }
        .inbox-assign-tabs::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>

      {/* Forward media to another contact */}
      {forwarding && (
        <div onClick={() => setForwarding(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Forward to…</h3>

            {forwarding.length === 1 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, background: 'var(--canvas)', marginBottom: 16 }}>
                {forwarding[0].kind === 'video'
                  ? <video src={toPublicUrl(forwarding[0].url)} style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  : <img src={toPublicUrl(forwarding[0].thumbUrl || forwarding[0].url)} alt="" style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                <span style={{ fontSize: 13, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {forwarding[0].name || (forwarding[0].kind === 'video' ? 'Video' : 'Photo')}
                </span>
              </div>
            ) : (
              <div style={{ padding: 10, borderRadius: 10, background: 'var(--canvas)', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{forwardPicked.filter(Boolean).length} of {forwarding.length} selected</span>
                  <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>Tap to leave one out</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 6 }}>
                  {forwarding.map((a, i) => {
                    const on = !!forwardPicked[i]
                    return (
                      <button key={i} type="button" aria-pressed={on} aria-label={`${on ? 'Leave out' : 'Include'} ${a.name || (a.kind === 'video' ? 'video' : 'photo')} ${i + 1}`}
                        onClick={() => setForwardPicked(p => p.map((v, j) => j === i ? !v : v))}
                        style={{ position: 'relative', aspectRatio: '1', padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#e5e7eb', outline: on ? '2px solid var(--coral)' : 'none', outlineOffset: -2 }}>
                        {a.kind === 'video' && !a.thumbUrl
                          ? <video src={toPublicUrl(a.url) + '#t=0.1'} preload="metadata" muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.4 }} />
                          : <img src={toPublicUrl(a.thumbUrl || a.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: on ? 1 : 0.4 }} />}
                        <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--coral)' : 'rgba(255,255,255,0.85)', border: on ? 'none' : '1.5px solid #a1a1aa', color: '#fff' }}>
                          {on && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

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
                  <button key={c.id} type="button" onClick={() => forwardTo(c)} disabled={forwardBusy || !forwardPicked.some(Boolean)}
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
      {showScheduleMsg && selected && (
        <div onClick={() => setShowScheduleMsg(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '95vw', background: '#fff', borderRadius: 18, padding: 24 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Schedule message</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Sends your reply automatically at the chosen time, on this conversation&rsquo;s channel.
            </p>
            <div style={{ fontSize: 13, color: 'var(--ink)', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, maxHeight: 90, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {reply.trim() || <span style={{ color: 'var(--slate)' }}>No message typed.</span>}
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Send at</label>
            <input type="datetime-local" value={scheduleMsgAt} onChange={e => setScheduleMsgAt(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setShowScheduleMsg(false)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={scheduleMessage} disabled={schedulingMsg || !reply.trim()}
                style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: (schedulingMsg || !reply.trim()) ? 'default' : 'pointer', opacity: (schedulingMsg || !reply.trim()) ? 0.6 : 1 }}>
                {schedulingMsg ? 'Scheduling…' : 'Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit a scheduled reply */}
      {editingScheduled && selected && (
        <div onClick={() => setEditingScheduled(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 460, maxWidth: '100%', background: '#fff', borderRadius: 18, padding: 22, boxSizing: 'border-box' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Edit scheduled message</h3>
            <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>Change the wording or the time. It still sends on this conversation&rsquo;s channel.</p>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Message</label>
            <textarea value={editingScheduled.message} autoFocus rows={5}
              onChange={e => setEditingScheduled(s => (s ? { ...s, message: e.target.value } : s))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, lineHeight: 1.5, resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Send at</label>
            <input type="datetime-local" value={editingScheduled.at}
              onChange={e => setEditingScheduled(s => (s ? { ...s, at: e.target.value } : s))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, marginBottom: 18, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setEditingScheduled(null)}
                style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={saveScheduledEdit} disabled={!!scheduledBusy || !editingScheduled.message.trim()}
                style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: (scheduledBusy || !editingScheduled.message.trim()) ? 0.6 : 1 }}>
                {scheduledBusy === editingScheduled.id ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                // WooCommerce returns prices like "17.9500" — show 2 decimals ($17.95).
                const fmtPrice = (v: any) => { const n = parseFloat(v); return isNaN(n) ? (v ?? '') : n.toFixed(2) }
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
                          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>${fmtPrice(price)}</span>
                          {onSale && <span style={{ fontSize: 11.5, color: '#9ca3af', textDecoration: 'line-through' }}>${fmtPrice(p.regular_price)}</span>}
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: inStock ? '#dcfce7' : '#fee2e2', color: inStock ? '#15803d' : '#dc2626' }}>
                            {inStock ? (p.manage_stock && p.stock_quantity != null ? `${p.stock_quantity} in stock` : 'In stock') : 'Out of stock'}
                          </span>
                        </p>
                        {p.sku && <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--slate)' }}>SKU: {p.sku}</p>}
                        {Array.isArray(p.stores) && p.stores.length > 0 && (
                          <div aria-label="Stock by store" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {p.stores.map((s: any) => (
                              <span key={s.store} title={`${s.available > 0 ? s.available : 'None'} at ${s.store}`}
                                style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 6px', borderRadius: 5, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: s.available > 0 ? '#ecfdf3' : 'var(--canvas)', color: s.available > 0 ? '#15803d' : 'var(--slate)', border: '1px solid var(--border)' }}>
                                {s.store} · {s.available > 0 ? s.available : 'none'}
                              </span>
                            ))}
                          </div>
                        )}
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
      {pickupModal && (() => {
        const loc = outlets.find(o => o.id === pickupModal.locationId)
        const locName = loc ? [loc.label, loc.suburb].filter(Boolean).join(', ') : 'our store'
        const orderNo = pickupModal.payload.order_number || pickupModal.payload.order_id
        const first = contact?.name ? String(contact.name).split(' ')[0] : ''
        const preview = `Hi${first ? ' ' + first : ''}, your order #${orderNo} is ready to be collected at: ${locName}. See you soon!`
        return (
          <div onClick={() => !pickupSending && setPickupModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(440px, 96vw)', padding: 22 }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Ready for pickup</h3>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)' }}>Confirm the collection location, then send the customer an SMS.</p>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Pickup location</label>
              {outlets.length > 0 ? (
                <select value={pickupModal.locationId} onChange={e => setPickupModal(m => m ? { ...m, locationId: e.target.value } : m)}
                  style={{ width: '100%', marginTop: 6, marginBottom: 14, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, background: '#fff' }}>
                  {outlets.map(o => <option key={o.id} value={o.id}>{[o.label, o.suburb].filter(Boolean).join(' · ')}{o.is_primary ? ' (default)' : ''}</option>)}
                </select>
              ) : (
                <p style={{ margin: '6px 0 14px', fontSize: 12.5, color: '#b45309' }}>No store locations set up yet — add one in Settings to name the pickup spot. The message will say "our store".</p>
              )}
              <div style={{ background: 'var(--peach)', borderRadius: 10, padding: '11px 13px', marginBottom: 16 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', marginBottom: 4 }}>Message preview</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{preview}</p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setPickupModal(null)} disabled={pickupSending}
                  style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                <button type="button" onClick={sendPickupReady} disabled={pickupSending}
                  style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: '#0891b2', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: pickupSending ? 0.6 : 1 }}>
                  {pickupSending ? 'Sending…' : 'Send SMS'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {invoicePreview && (
        <div onClick={() => { if (!invoiceSending) { URL.revokeObjectURL(invoicePreview.url); setInvoicePreview(null) } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 14, width: 'min(680px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Invoice #{invoicePreview.orderNumber}</h3>
              <button type="button" onClick={() => { URL.revokeObjectURL(invoicePreview.url); setInvoicePreview(null) }}
                style={{ background: 'none', border: 'none', fontSize: 24, lineHeight: 1, color: 'var(--slate)', cursor: 'pointer' }}>×</button>
            </div>
            <iframe src={invoicePreview.url} title="Invoice preview" style={{ flex: 1, width: '100%', border: 'none', minHeight: 420, background: '#f5f5f5' }} />
            <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={downloadInvoice} disabled={invoiceSending}
                style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                Download
              </button>
              <button type="button" onClick={sendInvoiceInChat} disabled={invoiceSending || !selected}
                style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: invoiceSending ? 0.6 : 1 }}>
                {invoiceSending ? 'Sending…' : 'Send in chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {orderGallery && (
        <div onClick={() => setOrderGallery(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.86)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <button type="button" onClick={() => setOrderGallery(null)}
            style={{ position: 'absolute', top: 18, right: 24, background: 'none', border: 'none', color: '#fff', fontSize: 30, lineHeight: 1, cursor: 'pointer' }}>×</button>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: '92vw' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {orderGallery.images.length > 1 && (
                <button type="button" onClick={() => setOrderGallery(g => g ? { ...g, index: (g.index - 1 + g.images.length) % g.images.length } : g)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}>‹</button>
              )}
              <ResilientImage src={orderGallery.images[orderGallery.index].src}
                fallback={<div style={{ width: 320, height: 320, maxWidth: '80vw', maxHeight: '68vh', borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 13 }}>Image unavailable</div>}
                style={{ maxWidth: '80vw', maxHeight: '68vh', objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
              {orderGallery.images.length > 1 && (
                <button type="button" onClick={() => setOrderGallery(g => g ? { ...g, index: (g.index + 1) % g.images.length } : g)}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%', fontSize: 22, cursor: 'pointer', flexShrink: 0 }}>›</button>
              )}
            </div>
            <p style={{ color: '#fff', fontSize: 13.5, margin: 0, textAlign: 'center', maxWidth: '80vw' }}>
              {orderGallery.images[orderGallery.index].name}
              {orderGallery.images.length > 1 && <span style={{ color: '#9ca3af', marginLeft: 8 }}>{orderGallery.index + 1} / {orderGallery.images.length}</span>}
            </p>
            {orderGallery.images.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '90vw' }}>
                {orderGallery.images.map((im, i) => (
                  <ResilientImage key={i} src={im.src} onClick={() => setOrderGallery(g => g ? { ...g, index: i } : g)}
                    fallback={<div style={{ width: 50, height: 50, borderRadius: 7, background: 'rgba(255,255,255,0.12)', border: i === orderGallery.index ? '2px solid var(--coral)' : '2px solid transparent' }} />}
                    style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 7, cursor: 'pointer', border: i === orderGallery.index ? '2px solid var(--coral)' : '2px solid transparent', opacity: i === orderGallery.index ? 1 : 0.55 }} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {refundOrder && companyId && (
        <RefundOrderModal companyId={companyId} order={refundOrder} accent={companyInfo?.accent_color || 'var(--coral)'}
          onClose={() => setRefundOrder(null)}
          onDone={(amt, reason) => { const o = refundOrder; setRefundOrder(null); afterOrderRefund(o, amt, reason) }} />
      )}

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
            <FilePickerButton
              accept="image/*,video/*"
              label={podFiles.length ? `${podFiles.length} file${podFiles.length === 1 ? '' : 's'} selected — add more` : 'Choose photos or video'}
              onFiles={files => setPodFiles(prev => [...prev, ...files])}
            />
            {podFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0 12px' }}>
                {podFiles.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '4px 9px', borderRadius: 7, background: 'var(--peach)', color: 'var(--coral)' }}>
                    {f.name}
                    <button type="button" onClick={() => setPodFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', cursor: 'pointer', display: 'flex' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--slate)', margin: '10px 0 6px' }}>Message to the customer</label>
            {/* Pre-written openers — tap Insert to drop one in, then edit. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[
                'Your order has been delivered. Attached is the proof of delivery — thank you!',
                'Hi! Your parcel has just been delivered and left in a safe spot. Photo attached.',
                'Delivery complete 🐟 Here\u2019s a photo for your records. Reply here if anything\u2019s not right.',
                'Your order arrived today — see the attached photo. Thanks for shopping with us!',
              ].map((tpl, i) => (
                <button key={i} type="button"
                  onClick={() => setPodNote(tpl)}
                  title={tpl}
                  style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 20, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Insert: {tpl.slice(0, 22)}…
                </button>
              ))}
            </div>
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
          onClose={() => setShowTimeline(false)}
          onOpenConversation={async (id: string) => {
            // Open that thread right here rather than reloading the inbox.
            setShowTimeline(false)
            if (id === selected?.id) return
            try {
              const { data } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle()
              if (data) await selectConversation(data)
            } catch {}
          }} />
      )}

      {showDialer && (
        <Dialer companyId={companyId} agentName={myName}
          onClose={() => setShowDialer(false)} />
      )}

      {showCompose && companyId && (
        <ComposeMessage
          companyId={companyId}
          senderName={myName}
          onClose={() => setShowCompose(false)}
          onStarted={(convId) => { setShowCompose(false); loadConversations(); }}
        />
      )}

      {showAddContact && companyId && (
        <AddContactModal
          companyId={companyId}
          onClose={() => setShowAddContact(false)}
          onCreated={() => { setShowAddContact(false); loadConversations(); showToast('Contact added'); setShowCompose(true) }}
        />
      )}

      {showInboxQR && companyId && (
        <PhoneUploadQR
          companyId={companyId}
          onUploaded={(items) => stageQrMedia(items)}
          onClose={() => setShowInboxQR(false)}
        />
      )}

      {showTracking && companyId && selected && (
        <SendTrackingModal
          companyId={companyId}
          conversationId={selected.id}
          contactId={contact?.id || null}
          orderNumber={(contact as any)?.last_order_number || null}
          senderName={myName}
          onClose={() => setShowTracking(false)}
          onSent={async ({ text }) => {
            setShowTracking(false)
            await sendTrackingMessage(text)
          }}
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
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 16, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Select source</option>
                  <option value="chat">Live chat enquiry</option>
                  <option value="order">Order placed</option>
                  <option value="cart">Abandoned cart</option>
                </select>

                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>Relationship</label>
                <select value={filters.relationship} onChange={e => setFilters({ ...filters, relationship: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 16, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">All types</option>
                  <option value="customer">Customer</option>
                  <option value="supplier">Supplier</option>
                  <option value="wholesaler">Wholesaler</option>
                  <option value="business">Business contact</option>
                </select>

                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>Order status</label>
                <select value={filters.orderStatus} onChange={e => setFilters({ ...filters, orderStatus: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, marginBottom: 6, boxSizing: 'border-box', background: '#fff' }}>
                  <option value="">Any status</option>
                  <option value="pending">Order placed (pending payment)</option>
                  <option value="processing">Processing</option>
                  <option value="on-hold">On hold</option>
                  <option value="completed">Completed</option>
                  <option value="refunded">Refunded</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="failed">Failed</option>
                </select>
                <p style={{ margin: '0 0 16px', fontSize: 11.5, color: 'var(--slate)' }}>Contacts with an order in this WooCommerce status. For abandoned carts, use Source above.</p>

                <label style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 7 }}>Purchased (SKU or title)</label>
                <input value={filters.purchased} onChange={e => setFilters({ ...filters, purchased: e.target.value })}
                  placeholder="e.g. 1132 or Pleco"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', background: '#fff' }} />
                <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>Matches the contact&rsquo;s order history.</p>
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
            [pinnedIds.has(ctxMenu.conv.id) ? 'Unpin' : 'Pin to top', <svg key="p" width="15" height="15" viewBox="0 0 24 24" fill={pinnedIds.has(ctxMenu.conv.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7z"/></svg>, () => togglePin(ctxMenu.conv)],
            [ctxMenu.conv.is_unread ? 'Mark as read' : 'Mark as unread', <svg key="r" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>, () => markRead(ctxMenu.conv)],
            ['Open in new tab', <svg key="o" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>, () => window.open(`/admin/inbox?conversation=${ctxMenu.conv.id}`, '_blank')],
            ['Copy link', <svg key="c" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, () => copyConvLink(ctxMenu.conv)],
            ['closed', 'resolved'].includes(String(ctxMenu.conv.status || ''))
              ? ['Open enquiry', <svg key="ro" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 3 3 9 9 9"/></svg>, () => reopenConv(ctxMenu.conv)]
              : ['Close enquiry', <svg key="x" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>, () => closeConv(ctxMenu.conv)],
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

            {savedCards === null ? (
              <div aria-busy="true" style={{ padding: '6px 0 4px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Card</div>
                <div className="cc-skel" style={{ height: 40, borderRadius: 9, marginBottom: 10 }} />
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--slate)' }}>Loading saved cards…</p>
                <style>{'.cc-skel{background:linear-gradient(90deg,#f1f1f3 25%,#e7e7ea 37%,#f1f1f3 63%);background-size:400% 100%;animation:ccSk 1.2s ease infinite}@keyframes ccSk{0%{background-position:100% 50%}100%{background-position:0 50%}}@media (prefers-reduced-motion: reduce){.cc-skel{animation:none}}'}</style>
              </div>
            ) : savedCards.length === 0 ? (
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
          channel={['widget', 'chat'].includes(outboundChannel) ? null : outboundChannel}
          channelLabel={['widget', 'chat'].includes(outboundChannel) ? null : (CHANNEL_NAME[outboundChannel] || outboundChannel)}
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
          staffName={myName}
          staffId={user?.id}
          prefillCart={orderPrefillCart}
          channel={['widget', 'chat'].includes(outboundChannel) ? null : outboundChannel}
          channelLabel={['widget', 'chat'].includes(outboundChannel) ? null : (CHANNEL_NAME[outboundChannel] || outboundChannel)}
          onDeliver={deliverToCustomer}
          onClose={() => { setShowCreateOrder(false); setOrderPrefillCart(null) }}
          onCreated={(order) => {
            if (orderPrefillCart?.id) { (supabase as any).from('abandoned_carts').update({ status: 'recovered', recovered_order_id: order?.id }).eq('id', orderPrefillCart.id).then(() => {}, () => {}); setAbandonedCarts(prev => prev.filter(c => c.id !== orderPrefillCart.id)) }
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
                {(() => {
                  // Walk the parent_id tree in parent→children order with a depth
                  // tag, so nested folders show under their parent (indented ↳)
                  // instead of as a flat list — matching the Gallery sidebar.
                  const flatten = (parentId: any = null, depth = 0): { f: any; depth: number }[] =>
                    galleryFolders
                      .filter((f: any) => (f.parent_id || null) === (parentId || null))
                      .flatMap((f: any) => [{ f, depth }, ...flatten(f.id, depth + 1)])
                  return flatten().map(({ f, depth }) => (
                    <button key={f.id} onClick={() => loadGalleryFolder(f.id)}
                      style={{ ...folderBtnInbox(galleryFolder === f.id), paddingLeft: 10 + depth * 14 }}>
                      {depth ? '↳ ' : ''}{f.name}
                    </button>
                  ))
                })()}
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
                            {(() => {
                              const imgThumb = item.thumbnail_url && item.thumbnail_url !== item.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(item.thumbnail_url) ? item.thumbnail_url : null
                              return item.kind === 'video'
                                ? (imgThumb
                                    ? <img src={imgThumb} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : <video src={item.url + '#t=0.1'} preload="metadata" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />)
                                : <img src={imgThumb || item.url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            })()}
                            {item.kind === 'video' && (
                              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                </span>
                              </span>
                            )}
                            {sel && <div style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, zIndex: 1 }}>✓</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{gallerySelected.size} selected</span>
                  <button onClick={stageSelectedMedia} disabled={gallerySelected.size === 0}
                    style={{ padding: '9px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: gallerySelected.size ? 'pointer' : 'not-allowed', opacity: gallerySelected.size ? 1 : 0.5 }}>
                    Attach {gallerySelected.size > 0 ? gallerySelected.size : ''}
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
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--ink)' }}>{dec(it.name)}</span>
                        <input type="number" min={0} value={it.quantity} onChange={e => setEditOrderData((d: any) => ({ ...d, items: d.items.map((x: any) => x.key === it.key ? { ...x, quantity: Math.max(0, parseInt(e.target.value) || 0) } : x) }))}
                          style={{ width: 60, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 13 }} />
                        <span style={{ fontSize: 12.5, fontWeight: 600, width: 60, textAlign: 'right' }}>${(parseFloat(it.total) || 0).toFixed(2)}</span>
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
      {showRecordSale && selected && companyId && (
        <RecordSaleModal
          companyId={companyId}
          conversation={selected}
          contact={contact}
          teamMembers={teamMembers as any}
          currentUser={{ id: user?.id, name: myName }}
          currency="AUD"
          onClose={() => setShowRecordSale(false)}
          onSaved={() => { setConvHasSale(true); if (selected) loadConversationExtras(selected.id) }}
        />
      )}
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
        const media: MediaItem[] = [...chatGalleryMedia(), ...emailGalleryMedia().map(({ key: _k, ...x }) => x)]
        return <MediaGallery items={media} index={galleryIndex} onClose={() => setGalleryIndex(null)} onIndex={setGalleryIndex} />
      })()}

      {/* Story-reply viewer — the story plus the thread's other media, so it
          reads like the normal gallery player with a thumbnail strip. */}
      {storyView && (
        <MediaGallery items={storyView.items} index={storyView.index}
          onClose={() => setStoryView(null)}
          onIndex={(i) => setStoryView(s => (s ? { ...s, index: i } : s))} />
      )}


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
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{(c as any).contacts?.name || dec(c.subject) || (c as any).sms_number || 'Visitor'}</div>
                  <div style={{ fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{waitlistPreview(c.last_message) || 'No messages'}</div>
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
                {(() => {
                  const def = (['none', 'billing', 'shipping'] as const).find(v => v === (companyInfo as any)?.payment_settings?.paylink_address) || 'none'
                  const cur = payAddress || def
                  return (
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Ask for an address</label>
                      <div role="radiogroup" aria-label="Ask for an address" className="pay-addr">
                        {([['none', 'No'], ['billing', 'Billing'], ['shipping', 'Delivery']] as const).map(([v, label]) => (
                          <button key={v} type="button" role="radio" aria-checked={cur === v} onClick={() => setPayAddress(v)} className={cur === v ? 'on' : ''}>{label}</button>
                        ))}
                      </div>
                      <style>{`.pay-addr{display:flex;gap:4px;padding:3px;border-radius:10px;background:var(--canvas)}.pay-addr button{flex:1;padding:7px 0;border:none;border-radius:8px;background:transparent;font-size:12.5px;font-weight:600;color:var(--slate);cursor:pointer;transition:background .2s ease,color .2s ease,box-shadow .2s ease}.pay-addr button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}`}</style>
                      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{cur === 'none' ? 'Stripe still asks for their email and the name on the card.' : cur === 'billing' ? 'They enter their billing address; it’s saved to their addresses.' : 'They enter where to deliver; it’s saved to their addresses.'}</p>
                    </div>
                  )
                })()}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--slate)', background: 'var(--canvas)', padding: '8px 12px', borderRadius: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Secure payment via Stripe. Card details are never stored by Colvy.{(companyInfo as any)?.payment_settings?.paylink_fill_contact !== false ? ' Their name and email fill in any blanks on the contact.' : ''}
                </div>
                <button type="button" onClick={sendPayment} disabled={!payAmount || paySending} style={{ padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: (!payAmount || paySending) ? 'default' : 'pointer', opacity: paySending ? 0.7 : 1 }}>
                  {(() => { const v = composeChannel(); const chat = v === 'widget' || v === 'chat'; return paySending ? (chat ? 'Sending…' : 'Making the link…') : chat ? 'Send payment request' : 'Add to reply' })()}
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
        <button type="button" onClick={() => setShowCompose(true)} title="New message" aria-label="New message" className="colvy-page-fab"
          style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 20, width: 52, height: 52, borderRadius: '50%', border: 'none', background: 'var(--coral)', color: '#fff', cursor: 'pointer', boxShadow: '0 6px 18px rgba(255,122,107,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          {/* The title with its unread count, then the actions, kept on one row
              in the column's 300px. */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 6 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Inbox</h2>
            {(() => {
              const n = conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length
              return n > 0 && (
                <span title={`${n} unread`} aria-label={`${n} unread`} style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box', borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, background: 'var(--peach)', color: 'var(--coral)', flexShrink: 0 }}>
                  {n > 99 ? '99+' : n}
                </span>
              )
            })()}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => setShowAddContact(true)} title="Add a contact manually"
                className="cv-btn" style={{ height: 30, padding: '0 12px', gap: 5, fontSize: 12.5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Contact
              </button>
              <Link href="/admin/crm-settings/profile" title="Inbox settings" aria-label="Inbox settings"
                className="cv-btn cv-btn-icon" style={{ width: 30, height: 30 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </Link>
              <button type="button" onClick={() => setSidebarCollapsed(true)} title="Collapse sidebar" aria-label="Collapse sidebar"
                className="cv-btn cv-btn-icon" style={{ width: 30, height: 30 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            </div>
          </div>
          <div style={{ position: 'relative' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#71717a', pointerEvents: 'none' }}><circle cx="11" cy="11" r="7"/><line x1="20.5" y1="20.5" x2="16" y2="16"/></svg>
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search conversations…" aria-label="Search conversations"
              className="il-search" style={{ paddingRight: searchTerm ? 36 : undefined }} />
            {searchTerm && (
              <button type="button" onClick={() => { setSearchTerm(''); setSearchScope('all') }}
                title="Clear search"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#e5e7eb', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
          {/* Scope pills — refine what the search looks at. Shown while typing.
              Themed to match the assignment tabs (coral/peach) rather than a
              one-off blue, and evenly spaced so the row reads cleanly. */}
          {searchTerm.trim() && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
              {([
                ['all', 'All'], ['contact', 'Contact'], ['messages', 'Messages'],
                ['ai', 'AI & Calls'], ['activity', 'Activity & Marketing'], ['tasks', 'Tasks'], ['notes', 'Notes'],
              ] as const).map(([key, label]) => {
                const on = searchScope === key
                return (
                <button key={key} type="button" onClick={() => setSearchScope(key)} aria-pressed={on} className={`il-chip${on ? ' on' : ''}`}>
                  {label}
                </button>
                )
              })}
            </div>
          )}
          {/* Location filter — scopes the whole inbox to one outlet. Only shown
              when the business actually has more than one location. */}
          {outlets.length > 1 && (
            <div style={{ position: 'relative', marginTop: 10 }}>
              {/* Map-pin icon sits inside the control so the select shows a real
                  SVG rather than an emoji glyph that renders differently per OS. */}
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', color: locationFilter !== 'all' ? 'var(--coral)' : '#52525b' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              </span>
              <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} aria-label="Location" className={`il-loc${locationFilter !== 'all' ? ' on' : ''}`}
                style={{ appearance: 'none' }}>
                <option value="all">All locations</option>
                {outlets.map(o => (
                  <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>
                ))}
              </select>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#71717a' }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          )}

          {/* Assignment tabs — a horizontally scrollable strip (Coax style).
              Instead of a raw scrollbar, chevron buttons flank the row and appear
              only when it overflows, dimming at each end. */}
          {(() => {
            const showArrows = assignArrows.l || assignArrows.r
            const unreadN = conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length
            const arrowBtn = (dir: 'l' | 'r', enabled: boolean, dot = false) => (
              <button type="button" aria-label={dir === 'l' ? 'Scroll left' : 'Scroll right'}
                onClick={() => assignScrollRef.current?.scrollBy({ left: dir === 'l' ? -150 : 150, behavior: 'smooth' })}
                disabled={!enabled}
                style={{ position: 'relative', flexShrink: 0, width: 26, height: 26, borderRadius: 999, border: 'none', background: '#f4f4f5', color: '#52525b', cursor: enabled ? 'pointer' : 'default', opacity: enabled ? 1 : 0.35, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'opacity 0.12s' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points={dir === 'l' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
                </svg>
                {/* Orange "new" dot: unread conversations live on a tab scrolled
                    out of view in this direction. */}
                {dot && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', border: '1.5px solid #fff' }} />}
              </button>
            )
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                {showArrows && arrowBtn('l', assignArrows.l)}
                <div ref={assignScrollRef} className="inbox-assign-tabs" style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1, paddingBottom: 0 }}>
                  {([
                    ['all', 'All'],
                    ['unread', 'Unread'],
                    ['mine', 'Assigned to me'],
                    ['unassigned', 'Unassigned'],
                  ] as const).map(([key, label]) => {
                    const unreadN = key === 'unread' ? conversations.filter(c => c.is_unread && !['closed', 'resolved'].includes(c.status)).length : 0
                    return (
                    <button key={key} type="button" onClick={() => setAssignFilter(key)} aria-pressed={assignFilter === key} className={`il-chip${assignFilter === key ? ' on' : ''}`}>
                      {label}{key === 'unread' && unreadN > 0 && <span className="il-chip-n">{unreadN}</span>}
                    </button>
                    )
                  })}
                </div>
                {showArrows && arrowBtn('r', assignArrows.r, unreadN > 0 && assignArrows.r && assignFilter !== 'unread')}
              </div>
            )
          })()}
          {/* Open / Closed — a status menu like Sellio's — and the other filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <div style={{ position: 'relative' }} data-status-menu>
              <button type="button" onClick={() => setShowStatusMenu(v => !v)} aria-haspopup="menu" aria-expanded={showStatusMenu}
                className={`il-status${showStatusMenu ? ' on' : ''}`} title="Filter by status">
                {statusFilter === 'open' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 13.5 5.6 5.4A1.5 1.5 0 0 1 7 4.5h10a1.5 1.5 0 0 1 1.4.9l2.6 8.1V18.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M3.4 13.5h4.8l1.6 2.5h4.4l1.6-2.5h4.8"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>}
                {statusFilter === 'open' ? 'Open' : 'Closed'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: '#71717a' }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {showStatusMenu && (
                <div className="th-menu" role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 210, zIndex: 40, transformOrigin: 'top left' }}>
                  <p className="th-menu-label">Filter by status</p>
                  {([['open', 'Open'], ['closed', 'Closed']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="menuitemradio" aria-checked={statusFilter === k} className={`th-menu-row${statusFilter === k ? ' cur' : ''}`}
                      onClick={() => { setShowStatusMenu(false); if (k !== statusFilter) { setConversations([]); setConvLimit(50); setStatusFilter(k) } }}>
                      {k === 'open' ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 13.5 5.6 5.4A1.5 1.5 0 0 1 7 4.5h10a1.5 1.5 0 0 1 1.4.9l2.6 8.1V18.5A1.5 1.5 0 0 1 19.5 20h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M3.4 13.5h4.8l1.6 2.5h4.4l1.6-2.5h4.8"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9"/><polyline points="8 12.5 11 15.5 16 9.5"/></svg>}
                      <span style={{ flex: 1 }}>{label}</span>
                      {statusFilter === k && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#18181b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12"/></svg>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => setShowFilters(true)} title="More filters" aria-label={activeFilterCount > 0 ? `More filters (${activeFilterCount} on)` : 'More filters'}
              className={`th-btn${activeFilterCount > 0 ? ' on' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>
              {activeFilterCount > 0 && <span className="il-badge">{activeFilterCount}</span>}
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Until the chat widget is on their website: how to add it (owners and admins). */}
          {isManager && !searchTerm.trim() && statusFilter !== 'closed' && activeFilterCount === 0 && <WidgetInstallCard companyId={companyId} />}
          {colvyAt === 0 && filteredConvs.length === 0 && colvyRowEl}
          {filteredConvs.length === 0 && (() => {
            // An empty list that still feels alive, worded for what's being looked at.
            const term = searchTerm.trim()
            const [title, line] = term ? ['No matches', `Nothing matches “${term}”. Try a name, number or a word from the chat.`]
              : statusFilter === 'closed' ? ['No closed conversations', 'Conversations you close will show up here.']
              : activeFilterCount > 0 || locationFilter !== 'all' ? ['Nothing matches these filters', 'Try clearing a filter to see more.']
              : assignFilter === 'unread' ? ['You’re all caught up', 'New messages will show up here.']
              : assignFilter === 'mine' ? ['Nothing assigned to you', 'Conversations assigned to you will show up here.']
              : assignFilter === 'unassigned' ? ['Every conversation has an owner', 'New ones without an owner will show up here.']
              : ['No conversations yet', 'New conversations will show up here.']
            return <div style={{ paddingTop: 24 }}><EmptyScroll title={title} line={line} /></div>
          })()}
          {filteredConvs.map((conv, ci) => {
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
            // Each tag is its colour: a dot and the label on a soft tint of it.
            let source: { label: string; fg: string }
            // Set when the top tag is the source (Website) and the cart state
            // needs to show alongside it.
            let cartSecond: any = null
            // A live non-web channel wins over the subject-derived tag. Someone
            // who began as an order/cart but is now texting should read "SMS",
            // not keep an "Order Placed" badge forever.
            const CHANNEL_BADGE: Record<string, any> = {
              sms:       { label: 'SMS', fg: '#0d9488' },
              email:     { label: 'Email', fg: '#4f46e5' },
              instagram: { label: 'Instagram', fg: '#db2777' },
              facebook:  { label: 'Messenger', fg: '#2563eb' },
              messenger: { label: 'Messenger', fg: '#2563eb' },
              whatsapp:  { label: 'WhatsApp', fg: '#16a34a' },
              // A phone call is NOT a live-chat enquiry — without this it fell
              // through to the "Live Chat Enquiry" default below.
              phone:     { label: 'Phone', fg: '#0284c7' },
              call:      { label: 'Phone', fg: '#0284c7' },
              voice:     { label: 'Phone', fg: '#0284c7' },
              // Someone's private Colvy chat (Colvy's own inbox only).
              colvy:     { label: 'Colvy app', fg: '#e2553f' },
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
              source = { label: 'Website', fg: '#7c3aed' }
              cartSecond = { label: 'Abandoned cart', fg: '#e11d48' }
            } else if (subj.startsWith('order #') || (c as any).order_status) {
              // Read the ACTUAL order status. This used to say "Order Placed" for
              // every order conversation — including failed payments, which is
              // exactly backwards: those are the ones needing attention.
              const os = String((c as any).order_status || '').toLowerCase()
              const ORDER_BADGE: Record<string, any> = {
                failed:     { label: 'Payment failed', fg: '#dc2626' },
                cancelled:  { label: 'Order cancelled', fg: '#dc2626' },
                refunded:   { label: 'Order refunded', fg: '#d97706' },
                'on-hold':  { label: 'Order on hold', fg: '#d97706' },
                pending:    { label: 'Payment pending', fg: '#ea580c' },
                completed:  { label: 'Order completed', fg: '#16a34a' },
                processing: { label: 'Order placed', fg: '#16a34a' },
              }
              source = ORDER_BADGE[os] || { label: 'Order placed', fg: '#16a34a' }
            } else {
              source = { label: 'Live Chat Enquiry', fg: '#7c3aed' }
            }
            const isLiveChat = source.label === 'Live Chat Enquiry'
            // Only PULSE as "live" when the visitor is genuinely on the widget
            // right now (heartbeat < 2 min). Otherwise the animated green dot made
            // every stale enquiry look like someone was actively waiting.
            const liveSeenTs = (c as any).page_seen_at ? parseTs((c as any).page_seen_at) : null
            const isLiveNow = !!liveSeenTs && (Date.now() - liveSeenTs.getTime()) < 120000

            // Secondary badge: when the primary badge is the CHANNEL (SMS, email,
            // Messenger…), also surface the order status if this customer has an
            // order — so an SMS conversation with a placed order shows BOTH
            // "SMS" and "Order Placed" rather than hiding the sale.
            let secondBadge: any = cartSecond
            if (CHANNEL_BADGE[ch]) {
              const os2 = String((c as any).order_status || '').toLowerCase()
              const ORDER_BADGE2: Record<string, any> = {
                failed:     { label: 'Payment failed', fg: '#dc2626' },
                cancelled:  { label: 'Order cancelled', fg: '#dc2626' },
                refunded:   { label: 'Order refunded', fg: '#d97706' },
                'on-hold':  { label: 'Order on hold', fg: '#d97706' },
                pending:    { label: 'Payment pending', fg: '#ea580c' },
                completed:  { label: 'Order completed', fg: '#16a34a' },
                processing: { label: 'Order placed', fg: '#16a34a' },
              }
              if (os2 && ORDER_BADGE2[os2]) secondBadge = ORDER_BADGE2[os2]
              else if (subj.startsWith('abandoned cart') && (c as any).cart_status !== 'recovered' && !os2) secondBadge = { label: 'Abandoned cart', fg: '#e11d48' }
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
            <Fragment key={conv.id}>
            {ci === colvyAt && colvyRowEl}
            <button type="button" onClick={() => selectConversation(conv)} data-conv-row={conv.id}
              onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, conv }) }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', paddingLeft: unread ? 11 : 14, border: 'none', borderLeft: unread ? `3px solid ${accent}` : '3px solid transparent', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === conv.id ? 'var(--peach)' : unread ? '#fff6f4' : '#fff', transition: 'background 0.1s' }}>
              {/* Location label — only shown when viewing All locations, so the
                  agent can see which outlet each enquiry belongs to (Coax-style).
                  Live-chat widget conversations show "Live Chat". */}
              {locationFilter === 'all' && (() => {
                const locId = (conv as any).assigned_location_id || (conv as any).location_id
                const loc = outlets.find((o: any) => o.id === locId)
                // An abandoned cart or a placed order came from the store, not the
                // chat widget — labelling either "Live Chat" was misleading. Orders
                // carry the customer's name as the subject, so detect them by
                // order_status (matching the source badge above), not just subject.
                const subjLc = String(conv.subject || '').toLowerCase()
                const isCart = subjLc.startsWith('abandoned cart')
                const isOrder = !!(conv as any).order_status || subjLc.startsWith('order #')
                const isWidget = conv.channel === 'chat' || conv.channel === 'widget' || conv.channel === 'live_chat'
                const label = loc ? (loc.label || loc.suburb)
                  : (isCart || isOrder) ? 'Website'
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
                  {pinnedIds.has(conv.id) && (
                    <span title="Pinned" style={{ color: 'var(--coral)', flexShrink: 0, display: 'inline-flex' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7z"/></svg>
                    </span>
                  )}
                  <span style={{ fontSize: 13.5, fontWeight: conv.is_unread ? 700 : 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Highlight text={displayName} q={searchTerm} accent={accent} />
                  </span>
                  {contact.prexty_customer_id && (
                    <PrextyMark size={14} title="Prexty POS customer" />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
                  {isOverdue && (
                    <span title={`Waiting ${Math.floor(waitingHours)}h for a reply — reply or close this conversation.`}
                      style={{ display: 'inline-flex', color: '#f59e0b', flexShrink: 0 }}>
                      {/* Gentle clock icon (amber, not a red alert) — a nudge, not
                          an error about the customer. Native title tooltip on hover;
                          no custom CSS that could leak the text inline. */}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, color: '#9ca3af', fontStyle: 'italic' }}>{listTime(conv.last_message_at)}</span>
                </div>
              </div>

              {/* Source tag(s) — channel plus order status when both apply */}
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
                <span className="cv-tag" style={{ ['--tag' as any]: isLiveChat && isLiveNow ? '#16a34a' : source.fg }}>
                  <span className={`cv-tag-dot${isLiveChat && isLiveNow ? ' live' : ''}`} />
                  {isLiveChat ? (isLiveNow ? 'Live chat' : 'Web enquiry') : source.label}
                </span>
                {secondBadge && (
                  <span className="cv-tag" style={{ ['--tag' as any]: secondBadge.fg }}>
                    <span className="cv-tag-dot" />
                    {secondBadge.label}
                  </span>
                )}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {callMatches(activeCall, { conversationId: c.id, contactId: c.contact_id, phone: contact.phone || c.sms_number || (conv as any).subject || (typeof displayName === 'string' ? displayName : '') }) ? (
                  <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, color: '#059669', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'livePulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
                    {activeCall?.status === 'ringing' ? 'Calling…' : 'Ongoing call'}
                  </p>
                ) : ((conv.ai_status === 'thinking' || conv.ai_status === 'pending') && (!conv.ai_draft_send_at || Date.parse(conv.ai_draft_send_at) > Date.now() - 30000)) ? (
                  <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: '#e2553f', display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff7a6b', animation: 'livePulse 1.6s ease-in-out infinite', flexShrink: 0 }} />
                    {conv.ai_status === 'pending' ? 'Colvy AI is about to reply' : 'Colvy AI is writing…'}
                  </p>
                ) : (
                <p style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 12, color: conv.is_unread ? 'var(--ink)' : '#6b7280', fontWeight: conv.is_unread ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {(() => { const k = callGlyphKind(conv.last_message); return k ? <CallGlyph kind={k} /> : null })()}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Highlight text={(callGlyphKind(conv.last_message) ? stripCallEmoji(conv.last_message) : waitlistPreview(conv.last_message)) || 'No messages yet'} q={searchTerm} accent={accent} />
                  </span>
                </p>
                )}
                {conv.unread_count > 0 && (
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, background: 'var(--coral)', color: '#fff', minWidth: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', borderRadius: 20, boxSizing: 'border-box' }}>{conv.unread_count}</span>
                )}
              </div>
              {/* Where a deep search matched — a call transcript, an AI summary,
                  an older message, a note. Shown only when the match isn't
                  already visible in the name/last-message above, so the agent
                  can see WHY this conversation is in the results. */}
              {(() => {
                if (!searchTerm.trim()) return null
                const hit = searchMsgHits[c.id]
                if (!hit || hit.field === 'contact' || !hit.snippet) return null
                const ql = searchTerm.trim().toLowerCase()
                // Skip if the last-message preview already shows the match.
                if ((conv.last_message || '').toLowerCase().includes(ql)) return null
                return (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3, fontSize: 11, color: '#6b7280', overflow: 'hidden' }}>
                    <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: '#7c3aed' }}>{hit.field}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      <Highlight text={hit.snippet} q={searchTerm} accent={accent} />
                    </span>
                  </div>
                )
              })()}
              {conv.assigned_name && (
                <span style={{ fontSize: 10, color: '#2563eb', marginTop: 3, display: 'block' }}>Assigned: {conv.assigned_name}</span>
              )}
            </button>
            </Fragment>
            )
          })}
          {colvyAt > 0 && colvyAt === filteredConvs.length && colvyRowEl}
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
        {!selected && colvyOpen ? (
          <ColvyChatThread companyId={companyId} onBack={() => setMobilePane('list')} onRead={colvy.clearUnread} />
        ) : !selected ? (
          // Nothing open: the business's mark, quietly, and the keyboard keys.
          <div className="inbox-empty-thread" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.9 }}>
              {companyInfo?.logo_url
                ? <img src={companyInfo.logo_url} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: 'cover' }} />
                : <span style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800 }}>{(companyInfo?.name || 'C').slice(0, 1).toUpperCase()}</span>}
              <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{companyInfo?.name || 'Inbox'}</span>
            </div>
            <p style={{ margin: '14px 0 0', fontSize: 13.5, color: '#8e8e93' }}>Pick a conversation to start.</p>
            <div className="inbox-kbd-hints" style={{ position: 'absolute', bottom: 22, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: '#8e8e93' }}>
              <span className="inbox-kbd">J</span><span>/</span><span className="inbox-kbd">K</span><span style={{ marginRight: 8 }}>to move,</span>
              <span className="inbox-kbd">R</span><span style={{ marginRight: 8 }}>to reply,</span>
              <span className="inbox-kbd">⌘</span><span className="inbox-kbd">K</span><span>to search</span>
            </div>
          </div>
        ) : (
          <>
            {/* Detected contact details are auto-saved silently to empty fields;
                the contact card marks each with a sparkle ("Colvy AI saved
                this …"). No banner here — it was intrusive. */}

            {/* Thread header */}
            <div className={`inbox-thread-header${mToolsOpen ? ' m-tools-open' : ''}`} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: igThemeActive ? 'linear-gradient(135deg, rgba(131,58,180,0.08), rgba(225,48,108,0.08))' : msgrThemeActive ? 'linear-gradient(135deg, rgba(0,178,255,0.08), rgba(0,106,255,0.08))' : '#fff', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {/* Mobile: back to conversation list */}
              <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('list')} title="Back to chats" aria-label="Back to chats"
                style={{ display: 'none', height: 36, flexShrink: 0, borderRadius: 999, border: 'none', background: 'color-mix(in srgb, var(--coral) 12%, #fff)', cursor: 'pointer', alignItems: 'center', gap: 3, padding: '0 10px 0 6px', color: 'var(--coral)', fontSize: 13.5, fontWeight: 700, order: -2 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                <span className="inbox-back-label">Chats</span>
              </button>
              {/* Contact avatar — real profile photo (from Messenger/Instagram)
                  when we have it, initials otherwise. */}
              {(() => {
                const nm = headerName
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
                    {headerName}
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
                {/* Subtitle line: last-activity / channel, plus compact
                    engagement chips (Google review · social comment) so the name
                    line above stays uncluttered. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {isWebChat
                    ? (isOnPageNow && selected.page_title && <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>On: {dec(selected.page_title)}</span>)
                    : (() => {
                        // "Last activity 5m ago", Coax-style, from the customer's
                        // most recent message on the conversation.
                        const la = (selected as any).last_customer_activity_at || (selected as any).last_message_at
                        const rel = la ? timeAgo(la) : null
                        return rel
                          ? <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>Last activity {rel === 'now' ? 'just now' : `${rel} ago`}</span>
                          : <span style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>via {CHANNEL_NAME[activeChannel] || activeChannel}</span>
                      })()}
                  {contactReviews.count > 0 && contactReviews.latest && (
                    <a href={`/admin/reviews?review=${encodeURIComponent(contactReviews.latest.id)}`}
                      title={`Reviewed ${contactReviews.latest.rating}/5 on Google — view review`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#fff7e6', color: '#b7791f', textDecoration: 'none' }}>
                      <img src="https://www.google.com/favicon.ico" alt="" style={{ width: 10, height: 10 }} /> ★{contactReviews.latest.rating}
                    </a>
                  )}
                  {contactReviews.commentCount > 0 && contactReviews.latestComment && (
                    <a href={`/admin/social?comment=${encodeURIComponent(contactReviews.latestComment.id)}`}
                      title={`Commented on ${contactReviews.latestComment.platform === 'instagram' ? 'Instagram' : 'Facebook'} — view comment`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: contactReviews.latestComment.platform === 'instagram' ? '#fdeef6' : '#eef2ff', color: contactReviews.latestComment.platform === 'instagram' ? '#c13584' : '#1d4ed8', textDecoration: 'none' }}>
                      💬 {contactReviews.latestComment.platform === 'instagram' ? 'IG' : 'FB'}
                    </a>
                  )}
                </div>
              </div>

              {/* Browser calling — opens the draggable floating call panel
                  (GlobalCallBar) so the call survives navigating away or
                  switching conversations. */}
              {(contact?.phone || (selected as any).sms_number) && (
                <button type="button" title="Call" data-callbar-btn className="th-pill th-call"
                  onClick={() => window.dispatchEvent(new CustomEvent('colvy:call', { detail: {
                    number: contact?.phone || (selected as any).sms_number,
                    name: contact?.name,
                    contactId: contact?.id,
                    conversationId: selected.id,
                  } }))}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span className="inbox-call-label">Call</span>
                </button>
              )}

              {/* Tablet: slide the contact panel in */}
              <button type="button" className={`inbox-tablet-only th-btn${tabletContact ? ' on' : ''}`} style={{ display: 'none' }} onClick={() => setTabletContact(v => !v)} title="Contact info" aria-label="Contact info" aria-expanded={tabletContact}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/></svg>
              </button>
              {/* Mobile: open contact panel */}
              <button type="button" className="inbox-mobile-only th-btn" style={{ display: 'none' }} onClick={() => setMobilePane('contact')} title="Contact info" aria-label="Contact info">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21a8.38 8.38 0 0 1 13 0"/></svg>
              </button>
              {/* Phones: everything else (pin, assign, status, AI, products,
                  dialler, search, snooze…) opens in a tray under this row, so
                  the name row stays one tidy line with nothing cut off. */}
              <button type="button" className={`inbox-mobile-only inbox-m-more th-btn${mToolsOpen ? ' on' : ''}`} style={{ display: 'none' }} onClick={() => setMToolsOpen(v => !v)}
                title={mToolsOpen ? 'Hide actions' : 'More actions'} aria-label={mToolsOpen ? 'Hide actions' : 'More actions'} aria-expanded={mToolsOpen}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
              </button>
              <span className="inbox-m-break" aria-hidden style={{ display: 'none' }} />


              {/* Status: a tinted pill with its icon, like Sellio's. */}
              {(() => {
                const st = STATUS_COLOR[selected.status] || { bg: '#f3f4f6', color: '#6b7280' }
                return (
                  <div className="inbox-status-pill th-status" style={{ ['--st-bg' as any]: st.bg, ['--st-fg' as any]: st.color }}>
                    <span className="th-status-ic" aria-hidden>{STATUS_ICON[selected.status] || STATUS_ICON.open}</span>
                    <select value={selected.status} onChange={e => setStatus(e.target.value)} aria-label="Conversation status">
                      {Object.entries(STATUS_COLOR).map(([k, v]) => <option key={k} value={k}>{v.color && k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                    </select>
                    <svg className="th-status-chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                )
              })()}

              {/* Assign and ⋯ are TRUE siblings of the scrolling tools strip (not
                  inside it) — the strip's overflow-x/mask was clipping their taps
                  and dropdown menus when they lived inside it. */}
              {/* Assign: who has it (or "Assign"), and a menu to find a teammate. */}
              <div style={{ position: 'relative' }} data-assign-menu>
                <button type="button" onClick={() => { setShowAssignMenu(v => !v); setAssignSearch('') }} aria-expanded={showAssignMenu}
                  title={selected.assigned_name ? `Assigned to ${selected.assigned_name}` : 'Assign this conversation'} aria-label={selected.assigned_name ? `Assigned to ${selected.assigned_name}` : 'Assign'}
                  className={`th-pill th-assign${selected.assigned_name ? '' : ' none'}${showAssignMenu ? ' on' : ''}`}>
                  {selected.assigned_name
                    ? <><span className="th-av">{selected.assigned_name.charAt(0).toUpperCase()}</span><span className="th-assign-name">{selected.assigned_name}</span></>
                    : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/></svg>}
                </button>
                {showAssignMenu && (() => {
                  const q = assignSearch.trim().toLowerCase()
                  const matches = teamMembers.filter((m: any) => !q || (m.name || '').toLowerCase().includes(q))
                  const mine = teamMembers.find((m: any) => m.user_id && m.user_id === user?.id)
                  const row = (m: any, label?: string) => {
                    const cur = selected.assigned_to === m.user_id
                    return (
                      <button key={(label ? 'me-' : '') + m.id} type="button" onClick={() => assignTo(m)} className={`th-menu-row${cur ? ' cur' : ''}`}>
                        <span className="th-av sm">{m.name?.charAt(0).toUpperCase()}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || m.name}</span>
                        {cur && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Assigned"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                    )
                  }
                  return (
                    <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 260 }}>
                      <div style={{ position: 'relative' }}>
                        <input autoFocus value={assignSearch} onChange={e => setAssignSearch(e.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" className="th-menu-search" />
                        {assignSearch && (
                          <button type="button" onClick={() => setAssignSearch('')} aria-label="Clear"
                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        )}
                      </div>
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {mine && !q && <>{row(mine, 'Assign to me')}<div className="th-menu-sep" /><p className="th-menu-label">Teammates</p></>}
                        {matches.map(m => row(m))}
                        {matches.length === 0 && <p style={{ margin: 0, padding: '10px', fontSize: 13, color: '#9ca3af' }}>No teammates match.</p>}
                        {selected.assigned_to && !q && <><div className="th-menu-sep" /><button type="button" onClick={() => assignTo(null)} className="th-menu-row danger">Unassign</button></>}
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Tools strip: plain round icons. On phones this becomes a single
                  horizontally scrollable row under the customer's name — the
                  native chat-app pattern. */}
              <div className="inbox-header-tools">
              {/* Dialler — call any number */}
              <button type="button" onClick={() => setShowDialer(true)} title="Dialler — call any number" aria-label="Dialler" className="th-btn th-dial">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
                  <circle cx="5.5" cy="4.5" r="1.8"/><circle cx="12" cy="4.5" r="1.8"/><circle cx="18.5" cy="4.5" r="1.8"/>
                  <circle cx="5.5" cy="11" r="1.8"/><circle cx="12" cy="11" r="1.8"/><circle cx="18.5" cy="11" r="1.8"/>
                  <circle cx="5.5" cy="17.5" r="1.8"/><circle cx="12" cy="17.5" r="1.8"/><circle cx="18.5" cy="17.5" r="1.8"/>
                </svg>
              </button>

              {/* Search messages toggle */}
              <button type="button" onClick={() => { setShowMsgSearch(v => !v); setMsgSearch(''); setMsgSearchIdx(0) }} title="Search messages" aria-label="Search messages" aria-pressed={showMsgSearch}
                className={`th-btn${showMsgSearch ? ' on' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7"/><line x1="20.5" y1="20.5" x2="16" y2="16"/></svg>
              </button>

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
                aria-label={(selected as any).ai_enabled === false ? 'Turn AI back on here' : 'Pause AI here'}
                className={`th-btn th-ai${(selected as any).ai_enabled === false ? ' off' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>
                {(selected as any).ai_enabled === false && <span className="th-ai-slash" aria-hidden />}
              </button>

              {/* Product search */}
              <button type="button" onClick={() => setShowProducts(true)} title="Product search — send a price or buy link" aria-label="Product search"
                className={`th-btn${showProducts ? ' on' : ''}`}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              </button>

              {/* Move or view enquiries across outlets */}
              {outlets.length > 0 && (
                <div ref={moveMenuRef} style={{ position: 'relative' }} data-move-menu>
                  <button type="button" onClick={() => setShowMoveMenu(v => !v)} title="Move or view enquiries" aria-label="Move or view enquiries" aria-expanded={showMoveMenu}
                    className={`th-btn${showMoveMenu ? ' on' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </button>
                  {showMoveMenu && (
                    <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 260, zIndex: 80 }}>
                      <p className="th-menu-label" style={{ marginTop: 4 }}>Move or view enquiries</p>
                      {outlets.map(o => {
                        const isCurrent = (selected as any).assigned_location_id === o.id
                        return (
                          <button key={o.id} type="button" onClick={() => !isCurrent && moveToOutlet(o)} className={`th-menu-row${isCurrent ? ' cur' : ''}`} style={{ cursor: isCurrent ? 'default' : 'pointer' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label || o.suburb}</span>
                            {isCurrent && <span style={{ fontSize: 12, fontWeight: 600, color: '#71717a', background: '#f4f4f5', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Current</span>}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
              </div>

              {/* Pin / unpin this conversation for the current agent. Mirrors the
                  right-click action so it's reachable while the thread is open. */}
              {(() => {
                const isPinned = pinnedIds.has(selected.id)
                return (
                  <button type="button" className={`inbox-pin-btn th-btn${isPinned ? ' on' : ''}`} onClick={() => togglePin(selected)}
                    title={isPinned ? 'Unpin from top' : 'Pin to top'} aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'} aria-pressed={isPinned}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={isPinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-3V7a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7z"/></svg>
                  </button>
                )
              })()}

              {/* More: snooze, copy link, merge, AI summary, and the customer's mood */}
              <div style={{ position: 'relative' }} data-actions-menu>
                <button type="button" onClick={() => setShowActions(v => !v)} title="More actions" aria-label="More actions" aria-expanded={showActions}
                  className={`th-btn${showActions ? ' on' : ''}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                </button>
                {showActions && (
                  <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 236 }}>
                    <button type="button" onClick={() => { setShowActions(false); setShowSnooze(true) }} className="th-menu-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Snooze
                    </button>
                    <button type="button" onClick={() => { copyChatLink(); setShowActions(false) }} className="th-menu-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> {linkCopied ? 'Copied!' : 'Copy chat link'}
                    </button>
                    <button type="button" onClick={() => { setShowActions(false); setShowMergePicker(true) }} className="th-menu-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8L22 12L18 16"/><path d="M2 12H22"/><path d="M6 8L2 12L6 16"/></svg> Merge conversation
                    </button>
                    <button type="button" onClick={() => { generateAiSummary(); setActivePanel('info'); setShowActions(false) }} className="th-menu-row">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/></svg> AI summary &amp; to-dos
                    </button>
                    <div className="th-menu-sep" />
                    <p className="th-menu-label">Customer mood</p>
                    <div style={{ display: 'flex', gap: 4, padding: '2px 4px 4px' }}>
                      {(['positive', 'neutral', 'negative'] as const).map(m => {
                        const on = (selected as any).sentiment === m
                        return (
                          <button key={m} type="button" onClick={() => setSentiment(m)} title={`Mark ${m}`} aria-label={`Mark ${m}`} aria-pressed={on}
                            className={`th-mood${on ? ' on' : ''}`} style={{ ['--mood' as any]: SENTIMENT_COLOR[m] }}>
                            {SENTIMENT_ICON[m](18)}
                          </button>
                        )
                      })}
                    </div>
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

            {/* Who this is: spent, orders, last order, tags; click for recent orders. */}
            <CustomerGlance companyId={companyId} contactId={contact?.id} orders={wooOrders} tags={contact?.tags}
              onOpenOrders={() => {
                setActivePanel('orders')
                // Phones show one pane at a time; tablets slide the panel in.
                const w = window.innerWidth
                if (w < 768) setMobilePane('contact')
                else if (w <= 1100) setTabletContact(true)
              }} />

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

            {/* Message search bar — find-in-conversation with match counter,
                previous/next navigation (top-down) and a clear/close button. */}
            {showMsgSearch && (() => {
              const total = msgMatchIds.length
              const has = total > 0
              const cur = has ? Math.min(msgSearchIdx, total - 1) + 1 : 0
              const goNext = () => { if (total) setMsgSearchIdx(i => (Math.min(i, total - 1) + 1) % total) }
              const goPrev = () => { if (total) setMsgSearchIdx(i => (Math.min(i, total - 1) - 1 + total) % total) }
              const close = () => { setShowMsgSearch(false); setMsgSearch(''); setMsgSearchIdx(0) }
              const navBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: has ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: has ? 'var(--slate)' : '#cbd5e1', flexShrink: 0 }
              return (
              <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--canvas)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <style>{`.cmsg-active-hit{border-radius:12px;box-shadow:0 0 0 2px color-mix(in srgb, var(--coral) 55%, transparent);background:color-mix(in srgb, var(--coral) 8%, transparent);scroll-margin:16px;}`}</style>
                <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input autoFocus value={msgSearch} onChange={e => setMsgSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? goPrev() : goNext() } else if (e.key === 'Escape') { e.preventDefault(); close() } }}
                    placeholder="Search in this conversation…"
                    style={{ width: '100%', padding: '8px 64px 8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  {msgSearch && (
                    <span style={{ position: 'absolute', right: 10, fontSize: 11, fontWeight: 600, color: has ? 'var(--slate)' : '#ef4444', whiteSpace: 'nowrap' }}>
                      {has ? `${cur} / ${total}` : 'No matches'}
                    </span>
                  )}
                </div>
                <button type="button" onClick={goPrev} disabled={!has} title="Previous match (Shift+Enter)" style={navBtn}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                </button>
                <button type="button" onClick={goNext} disabled={!has} title="Next match (Enter)" style={navBtn}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <button type="button" onClick={close} title="Close search (Esc)" style={{ ...navBtn, cursor: 'pointer', color: 'var(--slate)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              )
            })()}

            {/* Messages */}
            <div ref={messagesScrollRef} className="inbox-messages"
              onScroll={e => {
                // Scrolling UP near the top of a windowed thread pulls the
                // previous page in (the viewport stays anchored). Downward
                // scrolls — including the open's own scroll-to-bottom — never do.
                const el = e.currentTarget
                const prevTop = lastThreadScrollTop.current
                lastThreadScrollTop.current = el.scrollTop
                if (el.scrollTop < prevTop && el.scrollTop < 400 && threadWinRef.current.since && !loadingOlderRef.current) loadOlderMessages()
              }}
              style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, scrollBehavior: 'auto' }}>
              {/* AI-detected action items → draft tasks. Sits inline at the top of
                  the thread and scrolls with the conversation (not sticky/floating),
                  so it never covers the newest messages. Mirrored in Timeline. */}
              {aiTodos.length > 0 && !tasks.some((tk: any) => {
                // Server-backed suppression: once these action items have been
                // turned into tasks (or the panel was created/dismissed before),
                // don't nag again — on any device, not just this browser.
                if (tk.source === 'ai_summary' || tk.source === 'call_summary') return true
                const tx = String(tk.text || tk.title || '').trim().toLowerCase()
                if (!tx) return false
                return aiTodos.some((td: any) => { const s = String(td.text || '').trim().toLowerCase(); return !!s && (tx === s || tx.includes(s) || s.includes(tx)) })
              }) && (
                <div style={{ maxWidth: 560, width: '100%', margin: '0 auto 4px', alignSelf: 'center', background: '#faf5ff', border: '1px solid #ede9fe', borderRadius: 14, padding: '4px 14px 14px' }}>
                  <DraftTasks
                    todos={aiTodos.map((t: any) => t.text).filter(Boolean)}
                    source="ai_summary" storageKey={`colvy-conv-tasks-${selected.id}`}
                    conversationId={selected.id} companyId={companyId || undefined}
                    teamMembers={teamMembers} outlets={outlets}
                    defaultLocationId={(selected as any)?.assigned_location_id || (selected as any)?.location_id || null}
                    actor={{ id: user?.id, name: myName }}
                    onCreated={() => { if (selected) loadConversationExtras(selected.id) }}
                    onClosedChange={setChatDraftsClosed}
                    contactName={contact?.name || null}
                    collapsible={chatDraftAnchor != null && draftsCollapsed(chatDraftAnchor, latestChat)}
                    bare
                  />
                </div>
              )}
              {(() => {
                // In-conversation search no longer FILTERS the thread down to
                // matches — that hid the surrounding conversation and had no way
                // back to the top. We keep the whole thread and instead highlight
                // matches in place, scrolling the active one into view (see the
                // find bar's next/previous nav).
                const list = messages
                // Lookup from a message's attachment to its gallery index (all
                // images/videos in the thread, memoised in threadIndex).
                const { mediaIndexOf } = threadIndex
                // Only the newest page of a long history is loaded: keep events,
                // calls and engagement older than it out until that page is (they
                // would otherwise pile up above the first loaded message).
                const windowStart = threadWin.convId === selected.id && threadWin.since ? tsOf(threadWin.since) : 0
                const inWindow = (x: any) => !windowStart || tsOf(x.created_at) >= windowStart
                let lastDay = ''
                const enquiryName = contact?.name || contact?.email || contact?.phone || 'a customer'
                const SRC: Record<string, string> = {
                  sms: 'SMS Enquiry', email: 'Email Enquiry', instagram: 'Instagram Enquiry',
                  facebook: 'Messenger Enquiry', messenger: 'Messenger Enquiry',
                  whatsapp: 'WhatsApp Enquiry', phone: 'Phone Call',
                  colvy: 'message in the Colvy app',
                }
                const subj = (selected.subject || '').toLowerCase()
                // Order threads carry the customer's NAME as the subject once a
                // contact is known, so a subject-only check misses them and they
                // fell through to "Live Chat Enquiry". Detect the order by its
                // order_status too — these came from the store, not the widget.
                const enquiryKind = subj.startsWith('abandoned cart') ? 'Abandoned Cart'
                  : (subj.startsWith('order #') || (selected as any).order_status) ? 'Order Placed'
                  : (SRC[(selected.channel || '').toLowerCase()] || 'Live Chat Enquiry')

                // The "New … Enquiry" line marks the START of the conversation,
                // so while older history is still unloaded the top of the thread
                // offers it instead (it also loads on scrolling up).
                const header = windowStart ? (
                  <div key="enquiry-header" style={{ textAlign: 'center', margin: '4px 0 6px' }}>
                    <button type="button" onClick={() => loadOlderMessages()} disabled={loadingOlder}
                      style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20, border: 'none', cursor: loadingOlder ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                      {loadingOlder ? 'Loading earlier messages…' : 'Load earlier messages'}
                    </button>
                  </div>
                ) : (
                  <div key="enquiry-header" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 14px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textAlign: 'center', minWidth: 0, overflowWrap: 'anywhere' }}>
                      {threadHeaderLine(enquiryKind, list, enquiryName)}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                )

                // Calls that already have a timeline message (server-posted or
                // browser-posted card) — don't double-render those from convCalls.
                const { linkedCallIds } = threadIndex
                // Which calls belong in the thread. Connected calls (duration
                // alone is unreliable — Telnyx inbound can finalise at 0s — so a
                // recording, a summary or a completed/answered status also count),
                // plus voicemails and missed calls. Only in-progress/ringing
                // attempts and dial-pad calls (no conversation) stay out.
                const extraCalls = convCalls
                  .filter((c: any) => {
                    if (linkedCallIds.has(c.id)) return false
                    if (!inWindow(c)) return false
                    const st = String(c.status || '')
                    const connected = (c.duration_seconds || 0) > 0 || c.recording_url || c.ai_summary || ['completed', 'answered'].includes(st)
                    const voicemail = c.is_voicemail || st.startsWith('voicemail')
                    const missed = ['missed', 'no-answer', 'no_answer', 'failed', 'busy', 'canceled', 'cancelled'].includes(st)
                    return connected || voicemail || missed
                  })
                  .map((c: any) => ({ __call: true, ...c }))

                const liveBanner = <LiveCallBanner key="live-call-banner" conversationId={selected.id} accent={companyInfo?.accent_color || 'var(--coral)'} />
                // A flagged customer message nobody has decided on yet (conversation protection).
                const undecided = (list as any[]).filter((m: any) => m.sender_type === 'visitor' && m.metadata?.protection?.verdict && m.metadata.protection.verdict !== 'clean' && !m.metadata.protection.cleared)
                const protectionBanner = (undecided.length > 0 || (contact as any)?.is_blocked) ? (
                  <ProtectionBanner key="protection-banner" verdict={(contact as any)?.is_blocked ? 'blocked' : undecided[undecided.length - 1].metadata.protection.verdict}
                    busy={protectionBusy} blocked={!!(contact as any)?.is_blocked} onNotSpam={markNotSpam} onBlock={contact?.id ? toggleBlockContact : undefined} />
                ) : null
                // Synthetic thread events for this customer's off-inbox engagement
                // (Google reviews + FB/IG comments), sorted in among the messages
                // by their own timestamp so the thread shows the whole relationship.
                const engagementEvents = [
                  ...contactReviews.reviews.map((r: any) => ({ id: `rev-${r.id}`, event_type: 'google_review', created_at: r.createdAt || new Date().toISOString(), __engRating: r.rating, __engComment: r.comment, __engReviewId: r.id })),
                  ...contactReviews.socialComments.map((c: any) => ({ id: `cmt-${c.id}`, event_type: 'social_comment', created_at: c.commentedAt || new Date().toISOString(), __engPlatform: c.platform, __engComment: c.message, __engCommentId: c.id })),
                ]
                const threadEvents = windowStart ? [...events, ...engagementEvents].filter(inWindow) : [...events, ...engagementEvents]
                return [header, liveBanner, protectionBanner, ...mergeEvents(list, threadEvents, extraCalls).map((item: any) => {
                if (item.__call) {
                  const thisDay = dayLabel(item.created_at)
                  const showDivider = thisDay && thisDay !== lastDay
                  if (thisDay) lastDay = thisDay
                  return (
                    <div key={`call-${item.id}`}>
                      {showDivider ? (
                        <div style={{ textAlign: 'center', margin: '10px 0 4px' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', background: '#eef0f2', padding: '3px 12px', borderRadius: 20 }}>{thisDay}</span>
                        </div>
                      ) : null}
                      <CallCard callId={item.id} meta={{ direction: item.direction, duration_seconds: item.duration_seconds, agent_name: item.agent_name }} timestamp={item.created_at} collapseDrafts={draftsCollapsed(item.created_at, latestChat)} contactName={contact?.name || null} highlight={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} actor={{ id: user?.id, name: myName }} teamMembers={teamMembers} outlets={outlets} defaultLocationId={(selected as any)?.assigned_location_id || (selected as any)?.location_id || null} onTasksCreated={onAiTasksCreated} />
                    </div>
                  )
                }
                if (item.__event) {
                  const ev = item
                  // This customer left a Google review — a slim, centered pill
                  // that opens the review inside Colvy.
                  if (ev.event_type === 'google_review') {
                    const stars = Math.max(0, Math.min(5, ev.__engRating || 0))
                    return (
                      <div key={`ev-${ev.id}`} style={{ textAlign: 'center', padding: '4px 0' }}>
                        <a href={`/admin/reviews?review=${encodeURIComponent(ev.__engReviewId)}`}
                          title={ev.__engComment ? `“${ev.__engComment}” — view review` : 'View review'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: '#fff7e6', color: '#b7791f', border: '1px solid #f2d693', padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: 460 }}>
                          <img src="https://www.google.com/favicon.ico" alt="" style={{ width: 13, height: 13 }} />
                          Wrote a Google review
                          <span style={{ color: '#f5b301', letterSpacing: 0.5 }}>{'★'.repeat(stars)}</span>
                          {ev.created_at && <span style={{ color: '#c8b578', fontWeight: 500 }}>· {fmtTime(ev.created_at)}</span>}
                        </a>
                      </div>
                    )
                  }
                  // This customer commented on a post/ad — a slim, centered pill
                  // that opens the comment in the Social Engagement manager.
                  if (ev.event_type === 'social_comment') {
                    const ig = ev.__engPlatform === 'instagram'
                    return (
                      <div key={`ev-${ev.id}`} style={{ textAlign: 'center', padding: '4px 0' }}>
                        <a href={`/admin/social?comment=${encodeURIComponent(ev.__engCommentId)}`}
                          title={ev.__engComment ? `“${ev.__engComment}” — view comment` : 'View comment'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: ig ? '#fdeef6' : '#eef2ff', color: ig ? '#c13584' : '#1d4ed8', border: `1px solid ${ig ? '#f6c6e0' : '#c7d2fe'}`, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, maxWidth: 460 }}>
                          💬 Commented on {ig ? 'Instagram' : 'Facebook'}
                          {ev.created_at && <span style={{ opacity: 0.7, fontWeight: 500 }}>· {fmtTime(ev.created_at)}</span>}
                        </a>
                      </div>
                    )
                  }
                  // A task finished on the Tasks page announces itself here as a
                  // green completion pill (and shows in the Timeline tab too).
                  if (ev.event_type === 'task_completed') {
                    return (
                      <div key={`ev-${ev.id}`} style={{ textAlign: 'center', padding: '4px 0' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#dcfce7', color: '#15803d', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, maxWidth: 420 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.detail || 'Task completed'}</span>
                          {ev.created_at && <span style={{ color: '#4d9e6a', fontWeight: 500 }}> · {fmtTime(ev.created_at)}</span>}
                        </span>
                      </div>
                    )
                  }
                  // Colvy AI action — a sparkle divider, tinted, attributed to
                  // Colvy AI (e.g. "Address and delivery updated by Colvy AI").
                  if (ev.event_type === 'ai_update' || ev.actor_name === 'Colvy AI') {
                    return (
                      <div key={`ev-${ev.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                        <div style={{ flex: 1, height: 1, background: 'color-mix(in srgb, var(--coral, #ff7a6b) 22%, transparent)' }} />
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--coral, #ff7a6b)', whiteSpace: 'nowrap', maxWidth: 460, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4L12 2zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8L19 14zM5 15l.7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7L5 15z"/></svg>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.detail || 'Updated by Colvy AI'}</span>
                          <span style={{ opacity: 0.75, fontWeight: 500 }}>· {ev.metadata?.agent_run_id ? (ev.actor_name || 'Support Agent').replace(/^Colvy /, '') : 'Colvy AI'}</span>
                          {ev.created_at && <span style={{ opacity: 0.55, fontWeight: 500 }}> · {fmtTime(ev.created_at)}</span>}
                        </span>
                        {ev.metadata?.agent_run_id && <WhyLink companyId={companyId} runId={ev.metadata.agent_run_id} style={{ fontSize: 11.5, flexShrink: 0 }} />}
                        <div style={{ flex: 1, height: 1, background: 'color-mix(in srgb, var(--coral, #ff7a6b) 22%, transparent)' }} />
                      </div>
                    )
                  }
                  // Inline timeline event: "Conversation assigned to X",
                  // "Now chatting through SMS", "Enquiry moved to …"
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
                // team reads it in sequence, but is visually unmistakable (amber
                // card with a left accent, a lock, a "Team only" badge and the
                // author) so it's never confused with a customer message.
                // The AI phone agent's call: one compact card with the transcript
                // on demand, instead of a call card plus a long note.
                if (isInternal && (msg as any).metadata?.phone_agent) return (
                  <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                    {dateDivider}
                    <AiCallNote content={msg.content} metadata={(msg as any).metadata} createdAt={msg.created_at} highlight={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} />
                  </div>
                )
                // A waitlist note (a person's or an AI's add, old ones too): one quiet event line, not a note card.
                if (isWaitlistNote(msg)) return (
                  <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                    {dateDivider}
                    <WaitlistNoteLine msg={msg} companyId={companyId} fmtTime={fmtTime} />
                  </div>
                )
                if (isInternal) {
                  const noteAuthor = (msg as any).sender_name || 'Team'
                  const noteInitials = noteAuthor.split(/\s+/).filter(Boolean).map((w: string) => w[0]).slice(0, 2).join('').toUpperCase() || 'T'
                  const noteRel = timeAgo(msg.created_at)
                  return (
                  <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                    {dateDivider}
                    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                      <div style={{ maxWidth: '86%', width: '100%', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 2px rgba(180,83,9,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, rowGap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ width: 26, height: 26, borderRadius: 8, background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            </span>
                            <span style={{ fontSize: 13.5, fontWeight: 800, color: '#78350f' }}>Internal note</span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: '#fff', border: '1px solid #fde68a', color: '#a16207', fontSize: 10.5, fontWeight: 700 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                              Team only
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                            <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fde68a', color: '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 800, flexShrink: 0 }}>{noteInitials}</span>
                            <span style={{ fontSize: 11.5, color: '#a16207', whiteSpace: 'nowrap' }}>{noteAuthor} · {noteRel === 'now' ? 'just now' : `${noteRel} ago`}</span>
                          </div>
                        </div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: '#422006', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {renderWithMentions(msg.content)}
                        </p>
                      </div>
                    </div>
                  </div>
                  )
                }
                // A connected call renders as a full Coax-style card — AI
                // summary, action items, recording player, transcript — not a
                // grey one-line pill.
                if (isSystem && (msg as any).metadata?.call_event && (msg as any).metadata?.call_id) return (
                  <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                    {dateDivider}
                    <CallCard callId={(msg as any).metadata.call_id} meta={(msg as any).metadata} timestamp={msg.created_at} collapseDrafts={draftsCollapsed(msg.created_at, latestChat)} contactName={contact?.name || null} highlight={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} actor={{ id: user?.id, name: myName }} teamMembers={teamMembers} outlets={outlets} defaultLocationId={(selected as any)?.assigned_location_id || (selected as any)?.location_id || null} onTasksCreated={onAiTasksCreated} />
                  </div>
                )
                if (isSystem) {
                  // A lifecycle marker (order placed/refunded, cart abandoned/
                  // recovered) renders as a compact, modern card: a neutral chip
                  // with a small tinted icon and a clean title/detail, plus any
                  // link surfaced as a button instead of a raw URL. Everything
                  // else keeps the tiny neutral pill (e.g. "started a chat").
                  const sm: any = (msg as any).metadata || {}
                  const orderStatus = String(sm.status || sm.order_automation || '').toLowerCase()
                  let kind = '', accent = '', title = ''
                  if (sm.sale_event) { kind = 'sale'; accent = '#16a34a'; title = 'Sale recorded' }
                  else if (sm.abandoned_cart) { kind = 'cart'; accent = '#d97706'; title = 'Abandoned cart' }
                  else if (sm.cart_recovered) { kind = 'recovered'; accent = '#16a34a'; title = 'Cart recovered' }
                  else if (sm.order_event || sm.order_id || sm.order_automation) {
                    if (orderStatus === 'refunded') { kind = 'refunded'; accent = '#d97706'; title = 'Order refunded' }
                    else if (orderStatus === 'failed') { kind = 'failed'; accent = '#dc2626'; title = 'Payment failed' }
                    else if (orderStatus === 'cancelled') { kind = 'failed'; accent = '#dc2626'; title = 'Order cancelled' }
                    else if (orderStatus === 'completed') { kind = 'placed'; accent = '#16a34a'; title = 'Order completed' }
                    else { kind = 'placed'; accent = '#16a34a'; title = 'Order placed' }
                  }
                  // A Prexty in-store sale reads as one, naming the receipt and the
                  // shop: "In-store sale · Receipt R49971 · Roxy Aquarium Somerton ·
                  // Order #125043 · $31.84". Newer lines carry it in metadata;
                  // older ones are matched to the order in the panel.
                  let posLine: string | null = null
                  if (kind || sm.prexty_order) {
                    const wo: any = sm.order_id != null ? wooOrders.find((o: any) => String(o.order_id || o.woo_order_id || o.id) === String(sm.order_id)) : null
                    const wpos = wo ? (wo.pos_source === 'prexty' ? { isPos: true, saleId: wo.pos_sale_id || '', outlet: wo.pos_outlet || '' } : posSaleInfo(wo)) : null
                    const isPos = sm.pos === 'prexty' || !!sm.prexty_order || !!wpos?.isPos
                    if (isPos) {
                      const locId = sm.location_id || wo?.pos_location_id || null
                      const loc = locId ? outlets.find((x: any) => x.id === locId) : null
                      const shop = (loc ? (loc.label || loc.suburb) : null) || sm.shop || sm.outlet || sm.pos_outlet || wpos?.outlet || ''
                      const saleId = sm.pos_sale_id || wpos?.saleId || ''
                      const raw0 = String(msg.content || '')
                      const num = sm.order_number || wo?.order_number || (raw0.match(/#\s*([\w-]+)/) || [])[1] || ''
                      const amt = (raw0.match(/\$\s?[\d,]+(?:\.\d+)?/) || [])[0] || (wo ? `$${(parseFloat(wo.total) || 0).toFixed(2)}` : '')
                      if (orderStatus === 'refunded') { kind = 'refunded'; accent = '#d97706'; title = 'In-store sale refunded' }
                      else if (orderStatus === 'cancelled' || orderStatus === 'failed') { kind = 'failed'; accent = '#dc2626'; title = 'In-store sale cancelled' }
                      else { kind = 'placed'; accent = '#16a34a'; title = 'In-store sale' }
                      posLine = [saleId ? `Receipt ${saleId}` : '', shop, num ? `Order #${num}` : '', amt].filter(Boolean).join(' · ')
                      if (sm.prexty_order && Array.isArray(sm.items) && sm.items.length) posLine += ` · ${sm.items.map((i: any) => `${i.qty}× ${i.name}`).join(', ')}`
                    }
                  }

                  if (!kind) {
                    // Plain system line — keep it light and unobtrusive.
                    return (
                      <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                        {dateDivider}
                        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>
                          <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>{msg.content}</span>
                        </div>
                      </div>
                    )
                  }

                  // Pull a link out of the body and strip the leading emoji /
                  // redundant title so the card reads cleanly.
                  const raw = String(msg.content || '')
                  const urlMatch = raw.match(/https?:\/\/\S+/)
                  const link = urlMatch ? urlMatch[0] : null
                  let detail = posLine ?? raw
                    .replace(link || '', '')
                    .replace(/^[^\p{L}\p{N}#$]+/u, '')          // leading emoji / arrows
                    .replace(new RegExp(`^\\s*${title}\\s*[—:\\-]*`, 'i'), '') // redundant title
                    .replace(/[\s:•\-–—]+$/u, '')                // trailing separators
                    .trim()

                  return (
                    <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                      {dateDivider}
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '5px 0' }}>
                        {/* Grows to the full stream width and wraps to more lines
                            rather than truncating, so the whole cart/order detail
                            is readable. Keeps the rounded-pill look on one line. */}
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 8, maxWidth: '100%', background: `color-mix(in srgb, ${accent} 13%, transparent)`, color: accent, padding: '7px 15px', borderRadius: 16, lineHeight: 1.45 }}>
                          <span style={{ flexShrink: 0, display: 'inline-flex', marginTop: 2 }}>{posLine != null ? <PrextyMark size={14} /> : <LifecycleIcon kind={kind} />}</span>
                          <span style={{ minWidth: 0, fontSize: 12, overflowWrap: 'anywhere' }}>
                            <span style={{ fontWeight: 700 }}>{title}</span>
                            {detail && <span style={{ opacity: 0.8, fontWeight: 500 }}>{` · ${detail}`}</span>}
                            {link && (
                              <a href={link} target="_blank" rel="noreferrer" title={link}
                                style={{ color: accent, marginLeft: 6, display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H8M17 7v9"/></svg>
                              </a>
                            )}
                          </span>
                        </span>
                      </div>
                    </div>
                  )
                }
                const reactions = Array.isArray((msg as any).reactions) ? (msg as any).reactions : []
                const readBy = visibleReadBy((msg as any).read_by, (msg as any).company_id)
                const atts = Array.isArray(msg.attachments) ? msg.attachments : []
                // Who sent it, for agent messages ("Support Agent · approved by Roxy
                // Aquarium · Why?"), and which teammates have read it. Shared by
                // chat bubbles and email cards so both say the same thing.
                const aiCredit = (msg as any).is_ai && (msg.metadata?.agent_run_id ? (
                      // Sent by an agent (Agent Engine): who let it go out, and why.
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#8b5cf6', fontWeight: 700 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/></svg>
                        {msg.metadata.agent_name || 'Support Agent'} · {msg.metadata.approved_by ? `${msg.metadata.edited ? 'edited' : 'approved'} by ${msg.metadata.approved_by}` : 'sent on its own'}
                        <span aria-hidden="true">·</span>
                        <WhyLink companyId={companyId} runId={msg.metadata.agent_run_id} style={{ color: '#8b5cf6' }} />
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#8b5cf6', fontWeight: 700 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/></svg>
                        AI reply · AI can make mistakes
                      </span>
                    ))
                const readByChip = readBy.length > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <span>Read by:</span>
                        <span style={{ display: 'inline-flex', gap: 2 }}>
                          {readBy.slice(0, 3).map((r: any, ri: number) => {
                            // Prefer a real profile photo: the reader stamps
                            // their own avatar; older entries fall back to the
                            // team-member list, then to the initial.
                            const rAvatar = r.avatar || teamMembers.find((t: any) => t.name === r.name)?.avatar
                            const tip = `Read by ${r.name}${r.at ? ` · ${new Date(r.at).toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}` : ''}`
                            return rAvatar ? (
                              <img key={ri} src={rAvatar} alt={r.name || ''} title={tip} loading="lazy" decoding="async"
                                style={{ width: 15, height: 15, borderRadius: '50%', objectFit: 'cover', display: 'inline-block' }} />
                            ) : (
                              <span key={ri} title={tip}
                                style={{ width: 16, height: 16, borderRadius: '50%', background: companyInfo?.accent_color || 'var(--coral)', color: '#fff', fontSize: 7.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                {r.name ? initialsOf(r.name) : (r.initial || '?')}
                              </span>
                            )
                          })}
                          {readBy.length > 3 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>+{readBy.length - 3}</span>
                          )}
                        </span>
                      </span>
                    )

                // Held back as possible spam (conversation protection): hidden until
                // someone chooses to review it.
                const prot = !isAgent && (msg as any).metadata?.protection
                if (prot && prot.verdict && prot.verdict !== 'clean' && !prot.cleared && !revealedMsgs.has(msg.id)) {
                  return (
                    <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                      {dateDivider}
                      <ProtectionCard name={contact?.name || msg.sender_name || 'Visitor'} verdict={prot.verdict} reasons={prot.reasons}
                        firstContact={(prot.reasons || []).includes('First message from an unknown sender')}
                        blocked={!!(contact as any)?.is_blocked} busy={protectionBusy}
                        onReview={() => setRevealedMsgs(prev => new Set(prev).add(msg.id))}
                        onNotSpam={markNotSpam} onBlock={contact?.id ? toggleBlockContact : undefined} />
                    </div>
                  )
                }

                // Email messages render as a full Coax-style card (From/To/Cc,
                // subject, formatted body, quoted history, attachments) rather
                // than a chat bubble of stripped text.
                if (String((msg as any).delivery_channel || '').toLowerCase() === 'email'
                    && ((msg as any).email_html || (msg as any).email_from || (msg as any).email_subject)) {
                  return (
                    <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                      {dateDivider}
                      {/* The card shows when it was received / sent itself. */}
                      <EmailMessage msg={msg} agentColor={companyInfo?.accent_color} businessName={companyInfo?.name} onOpenMedia={t => 'url' in t ? openChatMedia(t.url) : openEmailMedia(msg.id, t.index)} showWhy={canSeeEmailWhy} />
                      {/* The same credit line a text gets: which agent wrote it,
                          who approved or edited it, Why?, and who has read it. */}
                      {(aiCredit || readByChip) && (
                        <p style={{ margin: '-2px 0 8px', fontSize: 10.5, color: '#8a8f98', display: 'flex', gap: 6, alignItems: 'center', justifyContent: isAgent ? 'flex-end' : 'flex-start', flexWrap: 'wrap' }}>
                          {aiCredit}
                          {readByChip}
                        </p>
                      )}
                    </div>
                  )
                }

                const repliedMsg = (msg as any).reply_to ? (threadIndex.byId.get((msg as any).reply_to) || null) : null
                // Instagram theme: when enabled (Settings → Channels), agent
                // replies on an Instagram thread get the Instagram gradient +
                // rounder bubbles so the thread reads like the Instagram app.
                const igThemed = isAgent && selected?.channel === 'instagram' && !!(companyInfo as any)?.inbox_settings?.instagram_theme
                // Messenger equivalent: agent replies on a Facebook thread get the
                // Messenger blue + rounder bubbles when the theme is enabled.
                const msgrThemed = isAgent && (selected?.channel === 'facebook' || selected?.channel === 'messenger') && !!(companyInfo as any)?.inbox_settings?.messenger_theme
                // Automated (order automation, review reminders, etc.) — sent by
                // Colvy on the business's behalf, not by a team member.
                const isAutoMsg = isAgent && !!((msg as any).metadata?.auto)
                // Group reactions by emoji
                const reactionCounts: Record<string, number> = {}
                reactions.forEach((r: any) => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1 })
                return (
                  <div key={msg.id} id={`cmsg-${msg.id}`} data-cmsg="1">
                    {dateDivider}
                    <div className={`chat-msg-row${Date.now() - Date.parse((msg as any).created_at || '') < 15000 ? (isAgent ? ' msg-in mine' : ' msg-in') : ''}`} style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end', position: 'relative' }}>
                    {!isAgent && (
                      <div className="chat-cust-av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--peach)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--coral)', flexShrink: 0 }}>
                        {(contact?.name || msg.sender_name || 'V')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="chat-msg-col" style={{ maxWidth: '70%', minWidth: 0, position: 'relative' }}
                      onMouseEnter={() => setShowReactPicker(null)}>
                      {!isAgent && <p style={{ margin: '0 0 3px 4px', fontSize: 10, color: '#9ca3af' }}>{contact?.name || msg.sender_name || 'Visitor'}</p>}
                      {/* Outbound messages name the team member that sent them, so
                          an agent reply isn't mistaken for a customer message.
                          Automated messages (order automation, etc.) are sent by
                          Colvy on the business's behalf, so they're labelled
                          "Delivered by Colvy" with a spark badge rather than a
                          person's name. */}
                      {isAgent && (isAutoMsg ? (
                        <p style={{ margin: '0 4px 3px 0', fontSize: 10, color: '#8b5cf6', fontWeight: 700, textAlign: 'right', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                          <AiSparkIcon size={10} /> Delivered by Colvy
                        </p>
                      ) : (
                        <p style={{ margin: '0 4px 3px 0', fontSize: 10, color: '#9ca3af', textAlign: 'right' }}>{msg.sender_name || 'Team'}</p>
                      ))}

                      {/* Reply-to quote */}
                      {repliedMsg && (
                        <div style={{ fontSize: 11, color: '#6b7280', borderLeft: '3px solid var(--coral)', padding: '2px 8px', marginBottom: 3, background: 'var(--canvas)', borderRadius: 4, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          ↩ {repliedMsg.sender_name}: {repliedMsg.content.slice(0, 50)}
                        </div>
                      )}

                      <div className="msg-bubble" style={{
                        padding: (() => {
                          const hasMedia = atts.some((a: any) => a.kind === 'image' || a.kind === 'video')
                          // A media-only message shows the collage flush to the
                          // bubble edge; with text it gets a small frame.
                          if (hasMedia && !msg.content) return 0
                          if (hasMedia) return 4
                          return isMobile ? '7px 11px' : '10px 14px'
                        })(),
                        borderRadius: (igThemed || msgrThemed) ? '18px 18px 5px 18px' : (isAgent ? '14px 14px 4px 14px' : '14px 14px 14px 4px'),
                        background: igThemed ? 'linear-gradient(135deg,#5B51D8 0%,#A033C4 55%,#E1306C 100%)' : msgrThemed ? 'linear-gradient(135deg,#00B2FF 0%,#006AFF 100%)' : (isAgent ? 'var(--coral)' : '#fff'),
                        color: isAgent ? '#fff' : 'var(--ink)',
                        fontSize: 13, lineHeight: 1.5,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        border: isAgent ? 'none' : '1px solid var(--border)',
                        position: 'relative',
                        // A message carrying media caps at a phone-like width so a
                        // short caption wraps UNDER the media instead of stretching
                        // the bubble wide and leaving empty bubble colour beside a
                        // portrait clip (which is how it read on desktop before).
                        // A story-reply bubble hugs its portrait preview (≈150px)
                        // instead of stretching wide with empty space beside it.
                        maxWidth: (msg as any).metadata?.story_reply ? 182 : (atts.some((a: any) => a.kind === 'image' || a.kind === 'video') ? 300 : undefined),
                        width: (msg as any).metadata?.story_reply ? 'fit-content' : undefined,
                      }}>
                        {isAgent && (msg as any).metadata?.voice && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', margin: atts.length ? '4px 8px 2px' : '0 0 2px' }}>
                            <VoiceTag kind={(msg as any).metadata.voice} onColour />
                          </div>
                        )}
                        {/* Instagram story reply — show the story they replied
                            to (thumbnail) above their message, like Coax. */}
                        {(msg as any).metadata?.story_reply && (() => {
                          const sr = (msg as any).metadata.story_reply
                          const url: string | null = sr.story_url || null
                          // Newer story replies carry story_type (rehosted at
                          // ingestion). Older ones stored the raw Instagram
                          // messaging-CDN URL with no extension — the preview
                          // tries an image, then a (hover-playable) video.
                          const knownVideo = sr.story_type === 'video' || (!!url && /\.(mp4|mov|webm)(\?|$)/i.test(url))
                          // Open the full gallery player: the story first, then the
                          // thread's other shared media as thumbnails.
                          const openStory = (kind: 'image' | 'video') => {
                            if (!url) return
                            const chatMedia: MediaItem[] = []
                            galleryMessages.forEach((mm: any) => (Array.isArray(mm.attachments) ? mm.attachments : []).forEach((a: any) => {
                              const isImg = a.kind === 'image' || String(a.type || '').startsWith('image')
                              const isVid = a.kind === 'video' || String(a.type || '').startsWith('video')
                              if ((isImg || isVid) && a.url && a.url !== url) chatMedia.push({ url: a.url, name: a.name, kind: isVid ? 'video' : 'image', poster: videoPoster(a) })
                            }))
                            setStoryView({ items: [{ url, kind, name: 'Story' }, ...chatMedia], index: 0 })
                          }
                          return (
                            <div style={{ marginBottom: 6 }}>
                              <span style={{ display: 'block', fontSize: 11, opacity: 0.85, fontStyle: 'italic', marginBottom: 4 }}>Replied to your story</span>
                              {url ? (
                                <StoryReplyPreview url={url} knownVideo={knownVideo} onOpen={openStory} />
                              ) : (
                                <span style={{ display: 'block', width: 120, aspectRatio: '9 / 16', borderRadius: 10, background: 'linear-gradient(135deg,#F47133,#BC3081)' }} />
                              )}
                            </div>
                          )
                        })()}

                        {/* Attachments.
                            Facebook-style mosaic: every tile is edge-to-edge
                            with hairline gutters, and the shape of the grid
                            changes with the count. Tiles are cropped to fill
                            (object-fit: cover) so there are no letterbox bars
                            or ragged edges — that mismatch was what made the
                            old layout look unfinished. */}
                        {(() => {
                          const media = atts.filter((a: any) => a.kind === 'image' || a.kind === 'video')
                          const files = atts.filter((a: any) => a.kind !== 'image' && a.kind !== 'video')
                          const n = media.length
                          const shown = n > 5 ? media.slice(0, 5) : media
                          const W = 268                     // collage width
                          const GAP = 2
                          // A lone video WITH a caption should fill the bubble width
                          // (a landscape tile) so it reads like the mobile app —
                          // rather than hugging a narrow portrait strip beside the
                          // text. A media-only lone video keeps its tight fit.
                          const loneVideoWithText = n === 1 && shown[0]?.kind === 'video' && !!msg.content

                          // Facebook picks a shape per count. Each entry gives
                          // the grid template and the row heights.
                          const layout = (() => {
                            switch (Math.min(n, 5)) {
                              case 1: return { cols: '1fr', rows: 'auto' }
                              case 2: return { cols: '1fr 1fr', rows: '180px' }
                              case 3: return { cols: '2fr 1fr', rows: '96px 96px' }
                              case 4: return { cols: '1fr 1fr', rows: '110px 110px' }
                              default: return { cols: '1fr 1fr 1fr', rows: '132px 88px' }
                            }
                          })()

                          // Which cells span more than one track.
                          const spanOf = (i: number): React.CSSProperties => {
                            if (n === 3 && i === 0) return { gridRow: 'span 2' }
                            if (n >= 5) {
                              if (i === 0) return { gridColumn: 'span 2' }
                              if (i === 1) return { gridColumn: 'span 1' }
                            }
                            return {}
                          }

                          return (
                            <>
                              {n > 0 && (
                                <div style={{
                                  display: 'grid',
                                  // A lone video: let the single column hug the clip
                                  // ('auto'), not stretch to 1fr of the collage width —
                                  // otherwise a portrait clip leaves the bubble colour
                                  // (blue on outbound) showing beside it.
                                  gridTemplateColumns: n === 1 && shown[0]?.kind === 'video' && !loneVideoWithText ? 'auto' : layout.cols,
                                  gridAutoRows: layout.rows.split(' ')[0],
                                  gridTemplateRows: layout.rows,
                                  gap: GAP,
                                  justifyContent: 'start',
                                  // A lone video wraps tightly (fit-content) so a
                                  // portrait clip isn't letterboxed into a tall
                                  // grey box; a lone image still fills the width.
                                  // With a caption it fills the bubble width instead.
                                  width: loneVideoWithText ? '100%' : n === 1 ? (shown[0]?.kind === 'video' ? 'fit-content' : 'auto') : W,
                                  maxWidth: W,
                                  borderRadius: 14,
                                  overflow: 'hidden',
                                  marginBottom: (msg.content || files.length) ? 6 : 0,
                                }}>
                                  {shown.map((a: any, ai: number) => {
                                    const extra = n > 5 && ai === 4 ? n - 5 : 0
                                    return (
                                      <div key={ai} className="chat-att"
                                        onClick={() => setGalleryIndex(mediaIndexOf[a.url] ?? 0)}
                                        style={{
                                          ...spanOf(ai),
                                          position: 'relative', cursor: 'pointer',
                                          // Black (not grey) so a lone video that doesn't
                                          // perfectly fill reads as a clean video frame,
                                          // never a stray coloured bar.
                                          background: a.kind === 'video' ? '#000' : '#e5e7eb', overflow: 'hidden',
                                          // A lone video tile hugs the clip; a lone photo
                                          // keeps its shape; in a mosaic tiles fill cells.
                                          // With a caption the lone video fills a
                                          // landscape tile (like mobile) instead.
                                          ...(loneVideoWithText ? { width: '100%', aspectRatio: '4 / 3' } : n === 1 && a.kind === 'video' ? { width: 'fit-content', maxHeight: 320 } : n === 1 ? { maxHeight: 320 } : {}),
                                        }}>
                                        {a.kind === 'image' ? (
                                          <img
                                            /* The small preview made at upload time —
                                               a fraction of the bytes at this size.
                                               Falls back to the full image for older
                                               attachments that have no preview. */
                                            src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(a.url, 320)}
                                            onError={a.thumbUrl ? undefined : sizedImageFallback(a.url)}
                                            alt={a.name}
                                            loading="lazy"
                                            decoding="async"
                                            style={{ width: '100%', height: n === 1 ? 'auto' : '100%', maxHeight: n === 1 ? 320 : undefined, objectFit: n === 1 ? 'contain' : 'cover', display: 'block' }} />
                                        ) : (
                                          <>
                                            {/* No generated thumbnail? Seek a hair into the
                                               clip (#t=0.1) so the frame the browser paints
                                               isn't the usual black leader frame. Only set a
                                               poster when we actually have one — an empty
                                               poster forces that black first frame. */}
                                            <video
                                              src={a.thumbUrl ? toPublicUrl(a.url) : toPublicUrl(a.url) + '#t=0.1'}
                                              preload="metadata"
                                              muted
                                              playsInline
                                              {...(a.thumbUrl ? { poster: toPublicUrl(a.thumbUrl) } : {})}
                                              style={{ width: loneVideoWithText || n !== 1 ? '100%' : 'auto', height: loneVideoWithText || n !== 1 ? '100%' : 'auto', maxWidth: '100%', maxHeight: loneVideoWithText ? undefined : n === 1 ? 280 : undefined, objectFit: loneVideoWithText || n !== 1 ? 'cover' : 'contain', display: 'block', pointerEvents: 'none', background: '#111' }} />
                                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                              <div style={{ width: 38, height: 38, borderRadius: 19, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>▶</div>
                                            </div>
                                          </>
                                        )}

                                        {extra > 0 && (
                                          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, fontWeight: 700 }}>
                                            +{extra}
                                          </div>
                                        )}

                                        <button type="button" className="chat-att-fwd"
                                          onClick={e => { e.stopPropagation(); openForward(media) }}
                                          title={n > 1 ? 'Forward these photos to another contact' : 'Forward to another contact'}
                                          style={{ position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 7, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)', opacity: 0, transition: 'opacity 0.12s' }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                                        </button>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {files.map((a: any, ai: number) => {
                                // A voice note / audio clip plays inline rather than
                                // linking out.
                                const isAudio = a.kind === 'audio' || /^audio\//.test(a.type || '') || /\.(webm|ogg|m4a|mp3|wav|aac)(\?|$)/i.test(a.url || '')
                                if (isAudio) {
                                  return (
                                    <div key={`f${ai}`} style={{ marginBottom: msg.content ? 6 : 0, width: 'min(300px, 62vw)', maxWidth: '100%' }}>
                                      <VoicePlayer src={toPublicUrl(a.url)} name={a.name || 'Voice message'} style={{ background: '#fff' }} />
                                    </div>
                                  )
                                }
                                return (
                                  <a key={`f${ai}`} href={a.url} target="_blank" rel="noopener"
                                    style={{ display: 'flex', alignItems: 'center', gap: 8, color: isAgent ? '#fff' : 'var(--coral)', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginBottom: msg.content ? 6 : 0 }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{Icon.attach(12)}{a.name}</span>
                                  </a>
                                )
                              })}
                            </>
                          )
                        })()}
                        {/* Media-expiry badge — "Expires in 7 days" / "Expired". */}
                        {(() => {
                          const exp = atts.map((a: any) => a.expires_at).filter(Boolean).sort()[0]
                          if (!exp) return null
                          const ms = new Date(exp).getTime() - Date.now()
                          const del = atts.some((a: any) => a.expiry_mode === 'delete')
                          let label: string
                          if (ms <= 0) label = 'Expired'
                          else {
                            const days = Math.ceil(ms / 86400000)
                            const hrs = Math.ceil(ms / 3600000)
                            label = days >= 1 ? `Expires in ${days} day${days === 1 ? '' : 's'}` : `Expires in ${hrs} hour${hrs === 1 ? '' : 's'}`
                          }
                          return (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '2px 6px 4px', padding: '2px 8px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: isAgent ? 'rgba(255,255,255,0.2)' : 'var(--canvas)', color: isAgent ? '#fff' : 'var(--slate)' }}
                              title={del ? 'Auto-deletes from Colvy at expiry' : 'Recipient access is revoked at expiry'}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                              {label}{del ? ' · auto-delete' : ''}
                            </div>
                          )
                        })()}
                        {(msg as any).metadata?.review_request ? (
                          <div style={{ padding: '4px 2px 2px' }}>
                            {/* Review-request card, shown to the agent — mirrors
                                what the customer received. Updates to "completed"
                                once the customer leaves the review. */}
                            <ReviewCard msg={msg} companyId={companyId} render={(linkStats: any) => {
                              const completed = !!(msg as any).metadata?.review_completed
                              const rating = (msg as any).metadata?.review_rating || 0
                              const clicks = Math.max((msg as any).metadata?.review_clicks || 0, linkStats?.clicks || 0)
                              const title = completed ? 'Review Left' : ((msg as any).metadata?.review_title || 'Review Request Sent')
                              return (
                                // A neat, centered card (mirrors what the customer
                                // received) — white on the blue bubble, everything
                                // centered and even rather than left-hugging.
                                <div style={{ background: '#fff', borderRadius: 16, padding: '20px 16px 16px', width: 320, maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box', position: 'relative', textAlign: 'center' }}>
                                  {/* Google Business marker, top-left */}
                                  <img src="https://www.google.com/favicon.ico" alt="Google" style={{ position: 'absolute', left: 13, top: 13, width: 16, height: 16 }} />
                                  {/* Clicks / result badge, top-right */}
                                  <span style={{ position: 'absolute', right: 12, top: 12, fontSize: 10.5, fontWeight: 700, background: completed ? '#fff4d6' : '#e7f6ec', color: completed ? '#a97a12' : '#137a3e', padding: '3px 9px', borderRadius: 20 }}>
                                    {completed ? `★ ${rating}/5` : `${clicks} Click${clicks === 1 ? '' : 's'}`}
                                  </span>
                                  {/* Centered star avatar */}
                                  <span style={{ width: 40, height: 40, borderRadius: 20, background: '#eef2ff', color: '#3b6ef5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, marginBottom: 8 }}>★</span>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: '#5b6470', marginBottom: 10 }}>{title}</div>
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                                    {[1, 2, 3, 4, 5].map(s => (
                                      <span key={s} style={{ fontSize: 26, lineHeight: 1, color: completed && s <= rating ? '#f5b301' : '#dfe3e8' }}>★</span>
                                    ))}
                                  </div>
                                  {completed && rating > 0 && (
                                    <p style={{ margin: '10px 0 0', fontSize: 11.5, color: '#8a929c' }}>Customer left {rating} star{rating === 1 ? '' : 's'}</p>
                                  )}
                                  <LastOpen s={linkStats} />
                                </div>
                              )
                            }} />
                            {/* The message text (with the /m/ link) below the card —
                                capped to the card's width and centred so the whole
                                bubble reads as one balanced, even block. */}
                            <div style={{ marginTop: 10, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderTextWithLinks(msg.content)}</div>
                          </div>
                        ) : (
                          msg.content && (() => {
                            // Non-English inbound message → show the English
                            // translation by default, with a "View original" toggle.
                            const tLang = (msg as any).content_lang
                            const hasTr = !isAgent && !!(msg as any).translated_content && !!tLang && !/^en/i.test(String(tLang)) && tLang !== 'unknown'
                            const showOrig = showOriginalMsgs.has(msg.id)
                            const body = hasTr && !showOrig ? (msg as any).translated_content : msg.content
                            let langName = ''
                            if (hasTr) {
                              const c = String(tLang).toLowerCase()
                              try { const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(c); langName = (n && n.toLowerCase() !== c) ? n : c.charAt(0).toUpperCase() + c.slice(1) } catch { langName = c }
                            }
                            return (
                              <div style={{ padding: atts.length && atts[0].kind !== 'file' ? '4px 10px 6px' : 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {/* Links Colvy sent the customer → a card with opens / device / city. */}
                                {isAgent && /https?:\/\//.test(body || '') && <div style={{ whiteSpace: 'normal', marginTop: 2 }}><LinkCards companyId={companyId} text={body} conversationId={selected?.id || null} at={(msg as any).created_at || null} /></div>}
                                {renderTextWithLinks(body)}
                                {!hasTr && !isAgent && !(msg as any).translated_content && !/^en/i.test(String(tLang || '')) && mightNeedTranslation(msg.content) && (
                                  <div style={{ marginTop: 4, fontSize: 10.5 }}>
                                    <button type="button" onClick={() => translateMsg(msg.id)} disabled={translatingMsgs.has(msg.id)}
                                      style={{ background: 'none', border: 'none', padding: 0, cursor: translatingMsgs.has(msg.id) ? 'wait' : 'pointer', color: '#2563eb', fontSize: 10.5, fontWeight: 700, textDecoration: 'underline' }}>
                                      {translatingMsgs.has(msg.id) ? 'Translating…' : 'Translate'}
                                    </button>
                                  </div>
                                )}
                                {hasTr && (
                                  <div style={{ marginTop: 4, fontSize: 10.5, opacity: 0.8, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                    <span style={{ color: isAgent ? 'rgba(255,255,255,0.8)' : 'var(--slate)' }}>{showOrig ? `Original · ${langName}` : 'Translated · English'}</span>
                                    <button type="button" onClick={() => toggleMsgOriginal(msg.id)}
                                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: isAgent ? '#fff' : '#2563eb', fontSize: 10.5, fontWeight: 700, textDecoration: 'underline' }}>
                                      {showOrig ? 'View translation' : 'View original'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          })()
                        )}

                        {/* Nothing to show (no text, no files) — say so instead of
                            drawing an empty bubble. Older customer emails that were
                            only a photo or video arrived like this. */}
                        {!isAgent && !String(msg.content || '').trim() && atts.length === 0 && (!msg.message_type || msg.message_type === 'text')
                          && !(msg as any).metadata?.story_reply && !(msg as any).metadata?.media_attempt && !(msg as any).metadata?.review_request && (
                          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12.5, fontStyle: 'italic', color: 'var(--slate)', lineHeight: 1.45 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2, display: 'inline-block' }}><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            {isEmailWithoutChannel(msg)
                              ? 'This email came through with no text. If it had photos or a video, they weren\u2019t saved \u2014 open it in your mailbox to see them.'
                              : 'This message came through empty.'}
                          </span>
                        )}

                        {/* Customer tried to send media the carrier couldn't
                            deliver (MMS on an AU number). Surface it plainly with a
                            one-tap "Request media" → secure upload link. */}
                        {!isAgent && (msg as any).metadata?.media_attempt && (
                          <div style={{ marginTop: msg.content ? 6 : 0, padding: '11px 13px', borderRadius: 12, background: 'var(--peach)', border: '1px solid #ffd9d1' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--coral)' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                              <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)' }}>Customer attempted to send media</span>
                            </div>
                            <p style={{ margin: '5px 0 9px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }}>
                              MMS media could not be received on this number. Send them a secure upload link to receive it.
                            </p>
                            <button type="button" onClick={requestMediaQuick} disabled={quickMrBusy}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: quickMrBusy ? 'default' : 'pointer', opacity: quickMrBusy ? 0.6 : 1 }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              {quickMrBusy ? 'Sending…' : 'Request media'}
                            </button>
                          </div>
                        )}
                        {msg.message_type === 'payment' && msg.message_payload && (() => {
                          // The payment's card: amount, what it's for, and whether it's
                          // been paid (checked with Stripe while pending, see above).
                          const pp = msg.message_payload
                          const paid = pp.status === 'paid', refunded = pp.status === 'refunded'
                          const tone = paid ? '#059669' : refunded ? '#64748b' : '#635BFF'
                          return (
                            <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 10, background: '#fff', border: `1px solid ${paid ? '#bbf7d0' : 'var(--border)'}`, color: 'var(--ink)', whiteSpace: 'normal' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={tone} strokeWidth="2" style={{ flexShrink: 0 }}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>${(pp.amount_cents / 100).toFixed(2)} {String(pp.currency || 'aud').toUpperCase()}</span>
                                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 6, background: paid ? '#dcfce7' : refunded ? '#f1f5f9' : '#ede9fe', color: tone, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{paid ? '✓ Paid' : refunded ? 'Refunded' : 'Awaiting payment'}</span>
                              </div>
                              {pp.description && <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{pp.description}</p>}
                              {paid && (pp.paid_at || pp.card_last4 || pp.receipt_url) && (
                                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#059669', display: 'flex', columnGap: 8, rowGap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <span>{[
                                    pp.paid_at ? `Paid ${new Date(pp.paid_at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'Paid',
                                    pp.card_last4 ? `${String(pp.card_brand || 'Card').replace(/^./, (c: string) => c.toUpperCase())} ····${pp.card_last4}` : '',
                                  ].filter(Boolean).join(' · ')}</span>
                                  {pp.receipt_url && <a href={pp.receipt_url} target="_blank" rel="noopener noreferrer" style={{ color: '#059669', fontWeight: 700 }}>Receipt</a>}
                                </p>
                              )}
                            </div>
                          )
                        })()}
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
                            {msg.message_payload.channel === 'shopify' ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {msg.message_payload.admin_url && <a href={msg.message_payload.admin_url} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 12, fontWeight: 600, color: '#008060', textDecoration: 'none', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 7 }}>Open in Shopify</a>}
                              {msg.message_payload.pay_link && (
                                <button type="button" onClick={() => { navigator.clipboard?.writeText(msg.message_payload.pay_link); showToast('Payment link copied') }}
                                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Copy payment link</button>
                              )}
                              {!msg.message_payload.draft && (
                                <button type="button" onClick={() => generateInvoice(msg.message_payload)}
                                  style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Invoice PDF</button>
                              )}
                              <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'processing')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark paid (bank/other)</button>
                              <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'completed')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#059669', background: '#fff', border: '1px solid #bbf7d0', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>Mark completed</button>
                              <button type="button" onClick={() => updateOrderStatus(msg.message_payload, 'cancelled')}
                                style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fff', border: '1px solid #fecaca', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>{msg.message_payload.draft ? 'Delete draft' : 'Cancel'}</button>
                            </div>
                            ) : (
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
                            )}
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
                          {fmtReceipt(msg.created_at, isAgent, receiptChannel(msg, selected.channel)) || fmtTime(msg.created_at)}
                        </span>

                        {/* WhatsApp delivery: Sent / Delivered / Read, or why it wasn't delivered. */}
                        {isAgent && (msg as any).delivery_channel === 'whatsapp' && msg.metadata?.whatsapp?.status && (() => {
                          const w = msg.metadata.whatsapp
                          const bad = w.status === 'failed' || w.status === 'undelivered'
                          return (
                            <span title={bad ? (w.error || undefined) : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: bad ? '#dc2626' : w.status === 'read' ? '#2563eb' : '#16a34a', fontWeight: 700 }}>
                              {WA_STATUS_LABEL[w.status] || w.status}{w.template?.name ? ' · template' : ''}{bad && w.error ? ` · ${w.error}` : ''}
                            </span>
                          )
                        })()}

                        {aiCredit}

                        {/* Who on the team has seen it. Shown on BOTH sides — on an
                            agent message it answers "did my colleague see this?",
                            which is the question people actually have. Automated
                            (Colvy-sent) messages keep this too — seeing which
                            teammate has read an automation is genuinely useful. */}
                        {readByChip}
                      </p>

                      {/* Hover actions: react + reply */}
                      <div className={`chat-msg-actions${showReactPicker === msg.id ? ' pinned' : ''}`} style={{ position: 'absolute', top: -10, [isAgent ? 'left' : 'right']: -8, display: 'flex', gap: 2, background: '#fff', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', padding: '2px 4px', opacity: 0, transition: 'opacity 0.12s', pointerEvents: 'none' } as any}>
                        <button type="button" onClick={() => setShowReactPicker(showReactPicker === msg.id ? null : msg.id)}
                          style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--slate)', display: 'inline-flex' }} title="React">{Icon.smile(14)}</button>
                        <button type="button" onClick={() => { setReplyTo(msg); textareaRef.current?.focus(); if (!mComposerOpen) { setMComposerOpen(true); setTimeout(() => textareaRef.current?.focus(), 30) } }}
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
                        <img className="chat-agent-av" src={companyInfo.logo_url} alt="" loading="lazy" decoding="async" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={(e: any) => { e.target.style.display = 'none' }} />
                      ) : (
                        <div className="chat-agent-av" style={{ width: 28, height: 28, borderRadius: '50%', background: companyInfo?.accent_color || 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                          {(companyInfo?.name || msg.sender_name || 'A')[0].toUpperCase()}
                        </div>
                      )
                    )}
                  </div>
                  </div>
                )
              })]
              })()}
              {/* Colvy AI replying, live: writing… then a countdown with Send now / Edit / Cancel. */}
              <AiLiveReply
                conv={selected as any}
                onEdit={(text) => { setReply(text); setMComposerOpen(true); setTimeout(() => textareaRef.current?.focus(), 30) }}
                onChange={() => setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60)}
              />
              {/* Support Agent (Agent Engine): a suggested reply waiting for the team. */}
              <AgentSuggestion
                companyId={companyId}
                conversationId={selected?.id || null}
                onChange={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
              />
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
              /* ── Reply box: one card (Coax-style) ── */
              .cmp-card{border:1px solid var(--border);border-radius:18px;background:#f8f9fb;transition:border-color .2s,box-shadow .2s,background .2s}
              .cmp-card:focus-within{background:#fff;border-color:#d7dae0;box-shadow:0 0 0 4px rgba(255,122,107,.10),0 8px 24px -16px rgba(16,24,40,.25)}
              .cmp-card.note{background:#fffbeb;border-color:#fcd34d}
              .cmp-card.note:focus-within{box-shadow:0 0 0 4px rgba(245,158,11,.14)}
              .cmp-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px 2px}
              .cmp-mode{position:relative;display:inline-grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:10px;background:rgba(17,24,39,.06)}
              .cmp-mode-thumb{position:absolute;top:3px;bottom:3px;left:3px;width:calc(50% - 3px);border-radius:8px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08),0 2px 6px -2px rgba(16,24,40,.12);transition:transform .28s cubic-bezier(.22,1,.36,1)}
              .cmp-mode button{position:relative;z-index:1;display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:0!important;height:28px;padding:0 14px;border:none;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--slate);cursor:pointer;transition:color .2s}
              .cmp-mode button[aria-selected="true"]{color:var(--ink)}
              .cmp-card.note .cmp-mode button[aria-selected="true"]{color:#b45309}
              .cmp-via{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
              .cmp-via b{color:var(--ink);font-weight:700}
              .cmp-input::placeholder{color:#9ca3af}
              .cmp-input:focus{outline:none!important;box-shadow:none!important;border:none!important}
              .cmp-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px 10px}
              .cmp-tools{display:flex;align-items:center;gap:5px;min-width:0;flex:1 1 auto;flex-wrap:wrap}
              .cmp-send{display:flex;align-items:center;gap:8px;flex-shrink:0}
              .cmp-tool{transition:filter .15s,transform .15s cubic-bezier(.22,1,.36,1),background .15s,color .15s}
              .cmp-tool:hover{filter:brightness(.95);color:var(--ink)!important}
              .cmp-tool:active{transform:scale(.93)}
              .cmp-tool:focus-visible,.cmp-mode button:focus-visible{outline:2px solid var(--coral);outline-offset:1px}
              .cmp-hint{display:flex;justify-content:flex-end;gap:14px;padding:7px 6px 0;font-size:11.5px;color:#9ca3af}
              .cmp-hint kbd{font:inherit;font-weight:700;color:var(--slate);padding:1px 6px;border-radius:5px;background:#f3f4f6;border:1px solid #e5e7eb}
              /* Responsive: sized by the reply box's own width (it's narrow on
                 tablets with three columns), not just the screen. */
              .inbox-composer{container-type:inline-size}
              .cmp-bar{flex-wrap:wrap;row-gap:8px}
              .cmp-tools{flex:1 1 230px}
              .cmp-send{margin-left:auto}
              @container (max-width: 560px){ .cmp-hint{display:none} }
              /* Narrow box (phones, or the middle column on a tablet): tools on
                 their own line, then a full-width Send row. */
              @container (max-width: 470px){
                .cmp-bar{flex-direction:column;align-items:stretch}
                .cmp-tools{flex:0 0 auto}
                .cmp-send{margin-left:0;width:100%}
                .cmp-send > div:last-child{flex:1 1 auto;display:flex}
                .cmp-send > div:last-child > button:first-child{flex:1 1 auto}
              }
              @container (max-width: 300px){ .cmp-via{display:none} }
              @media (max-width: 380px){
                .inbox-composer .cmp-tools{gap:3px!important}
                .inbox-composer .cmp-tools .cmp-tool{width:32px!important;min-width:32px!important;height:32px!important;min-height:32px!important}
              }
              @media (prefers-reduced-motion:reduce){.cmp-mode-thumb,.cmp-tool{transition:none}}
            `}</style>

            {/* Reply box */}
            <div className={`inbox-composer ${mComposerOpen ? 'mcmp-open' : 'mcmp-collapsed'}`} style={{ padding: '10px 14px', background: '#fff', borderTop: '1px solid var(--border)', position: 'relative' }}>
              {/* Phones: the composer starts as this one-line bar so the thread
                  gets the screen. Tap it to write; the full composer (and any
                  draft) is still mounted underneath, just hidden. */}
              {(() => {
                const ch = sendChannel !== 'auto' ? sendChannel : outboundChannel
                const chName = ({ sms: 'SMS', email: 'Email', chat: 'Live chat', instagram: 'Instagram', messenger: 'Messenger', whatsapp: 'WhatsApp', call: 'SMS', colvy: 'Colvy app' } as Record<string, string>)[ch] || 'Chat'
                const draftText = ((showEmailComposer && !internalMode) ? emailDraftText : reply).replace(/\s+/g, ' ').trim()
                const first = contact?.name ? contact.name.split(' ')[0] : 'customer'
                return (
                  <div className="mcmp-bar">
                    <button type="button" className={`mcmp-reply${internalMode ? ' note' : ''}`} onClick={() => openMobileComposer()}
                      aria-label={internalMode ? 'Write an internal note' : `Reply by ${chName}`}>
                      <span className="mcmp-ch" title={internalMode ? 'Internal note' : `Sending by ${chName}`}>
                        {internalMode
                          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>
                          : sendChannelGlyph(ch, 15)}
                        <span className="mcmp-ch-name">{internalMode ? 'Note' : chName}</span>
                      </span>
                      <span className={`mcmp-text${draftText ? ' has-draft' : ''}`}>
                        {draftText ? <><b>Draft:</b> {draftText}</> : internalMode ? 'Write a note for your team…' : `Reply to ${first}…`}
                      </span>
                    </button>
                    <button type="button" className={`mcmp-note${internalMode ? ' on' : ''}`} onClick={() => openMobileComposer(!internalMode)}
                      aria-pressed={internalMode} title={internalMode ? 'Switch to a reply' : 'Write an internal note'}
                      aria-label={internalMode ? 'Switch to a reply' : 'Write an internal note'}>
                      {internalMode
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"/></svg>}
                      {internalMode ? 'Reply' : 'Note'}
                    </button>
                  </div>
                )
              })()}
              {/* Coax-style resize grip: drag the top border of the composer up
                  or down to grow/shrink the reply box — the chat box and the
                  email body share the same remembered height. */}
              <div
                onMouseDown={(e) => { e.preventDefault(); startComposerResize(e.clientY) }}
                onTouchStart={(e) => { if (e.touches[0]) startComposerResize(e.touches[0].clientY) }}
                onDoubleClick={() => { setComposerH(96); try { localStorage.setItem('colvy_composer_h', '96') } catch {} }}
                title="Drag up or down to resize"
                className="composer-grip"
                style={{
                  position: 'absolute', top: -11, left: 0, right: 0, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'ns-resize', zIndex: 30, touchAction: 'none',
                }}>
                <span className="composer-grip-pill" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: composerDragging ? '5px 12px' : '3px 9px', borderRadius: 999,
                  background: '#1f2430', color: '#fff', fontSize: 12, fontWeight: 600,
                  boxShadow: '0 6px 18px rgba(0,0,0,0.22)', whiteSpace: 'nowrap',
                  opacity: composerDragging ? 1 : 0, transform: composerDragging ? 'translateY(0)' : 'translateY(2px)',
                  transition: 'opacity .12s ease, transform .12s ease, padding .12s ease', pointerEvents: 'none',
                }}>
                  <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden><circle cx="2.5" cy="2.5" r="1.3"/><circle cx="7.5" cy="2.5" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="11.5" r="1.3"/><circle cx="7.5" cy="11.5" r="1.3"/></svg>
                  {composerDragging ? `${composerH}px` : 'Drag up or down to resize'}
                </span>
              </div>
              {/* Email threads get a proper email composer (To/Cc/Subject +
                  signature) instead of the plain chat box. */}
              {channelResolving && !internalMode ? (
                <div className="cmp-card" aria-busy="true" style={{ overflow: 'hidden' }}>
                  {renderModeHead()}
                  <div style={{ height: isMobile ? 64 : composerH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', fontSize: 12.5 }}>Choosing how to reach this customer…</div>
                </div>
              ) : showEmailComposer && !internalMode ? (
                <EmailComposer
                  header={renderModeHead()}
                  bodyHeight={isMobile ? undefined : composerH + 44}
                  compact={isMobile}
                  onBodyText={setEmailDraftText}
                  conversationId={selected.id}
                  companyId={companyId}
                  toEmail={contact?.email || ''}
                  defaultSubject={composerSubject(messages, selected as any, { businessName: companyInfo?.name, contactName: contact?.name, contactPhone: contact?.phone, contactEmail: contact?.email, contactSource: contact?.source, contactTags: contact?.tags })}
                  fromLabel={emailFromLabel}
                  replyTo={channelPick?.convId === selected.id ? channelPick.replyTo || null : null}
                  signature={emailSignature}
                  agentName={myName}
                  keyterms={[contact?.name, (contact as any)?.company_name].filter(Boolean) as string[]}
                  templateVars={templateVars}
                  extraTools={(insert) => <>{renderSendMenu(true, insert)}{renderLinkTools(true, insert)}</>}
                  onAiAssist={() => logAiUpdate('Reply drafted with Colvy AI')}
                  onSent={async () => {
                    await reloadThread(selected.id)
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
              <Popover open={showEmoji} onClose={() => setShowEmoji(false)} anchorRef={emojiBtnRef} width={252} prefer="top" label="Emoji" padding={8}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4 }}>
                  {EMOJIS.map(e => (
                    <button key={e} type="button" data-pop-item className="cpop-item" aria-label={`Insert ${e}`} onClick={() => { setReply(r => r + e); setShowEmoji(false) }}
                      style={{ width: 34, height: 34, padding: 0, justifyContent: 'center', fontSize: 20, borderRadius: 6 }}>{e}</button>
                  ))}
                </div>
              </Popover>

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

              {/* Unsent replies are kept per conversation, so you can leave and
                  come back without losing what you'd written. */}
              {draft.saved && reply.trim() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--slate)', marginBottom: 4 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Draft saved
                </div>
              )}

              {/* Voice-note recording bar */}
              {recording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', marginBottom: 8, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626', flexShrink: 0, animation: 'recPulse 1s infinite' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>Recording</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>{fmtRec(recSeconds)}</span>
                  <span style={{ flex: 1 }} />
                  <button type="button" onClick={() => stopVoiceNote(false)}
                    style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => stopVoiceNote(true)}
                    style={{ height: 30, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>
                    Stop &amp; attach
                  </button>
                </div>
              )}

              {/* Attached-but-unsent media — preview cards, delivered on Send.
                  New uploads carry a Media-expiry selector (Keep forever by
                  default); gallery picks don't, they're already kept there. */}
              {stagedMedia.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {/* Bulk expiry — set one expiry for every staged item at once
                      (mirrors the mobile app). Only worth showing for 2+ items. */}
                  {((!internalMode && expirable.length > 1) || stagedMedia.length > 3) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 2px 0' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {stagedMedia.length} attachments
                        {stagedMedia.length > 3 && (
                          <button type="button" onClick={() => { setStagedMedia([]); setStagedExpiry({}) }}
                            style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                            Remove all
                          </button>
                        )}
                      </span>
                      {!internalMode && expirable.length > 1 && <div data-bulk-expiry style={{ position: 'relative', flexShrink: 0 }}>
                        <button type="button"
                          onClick={() => { setBulkExpiryOpen(v => !v); setBulkCustomDate(false) }}
                          title="Set when all of these expire"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: bulkExpiryCode && bulkExpiryCode !== 'forever' ? 'var(--peach)' : '#fff', color: bulkExpiryCode && bulkExpiryCode !== 'forever' ? 'var(--coral)' : 'var(--slate)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                          Set expiry for all{bulkExpiryCode === '' ? '' : ` · ${expiryChip(bulkExpiryCode)}`}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {bulkExpiryOpen && (
                          <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 180, background: '#fff', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                            {[['forever', 'Keep forever'], ['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days']].map(([val, label]) => (
                              <button key={val} type="button"
                                onClick={() => { applyBulkExpiry(val); setBulkExpiryOpen(false) }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: bulkExpiryCode === val ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: bulkExpiryCode === val ? 700 : 500 }}>
                                {label}
                                {bulkExpiryCode === val && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                              </button>
                            ))}
                            <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                            {bulkCustomDate ? (
                              <div style={{ padding: '6px 10px' }}>
                                <input type="date" autoFocus
                                  min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                                  onChange={e => { if (e.target.value) { applyBulkExpiry(e.target.value); setBulkExpiryOpen(false); setBulkCustomDate(false) } }}
                                  style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box' }} />
                              </div>
                            ) : (
                              <button type="button" onClick={() => setBulkCustomDate(true)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                                Choose a date…
                              </button>
                            )}
                          </div>
                        )}
                      </div>}
                    </div>
                  )}
                  {/* Lots of attachments → a compact strip of thumbnails (scrolls
                      after two rows) so the reply box stays usable. Expiry for
                      these is set with "Set expiry for all" above. */}
                  {stagedMedia.length > 3 && (
                    <div className="staged-strip" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxHeight: 148, overflowY: 'auto', padding: 2 }}>
                      {stagedMedia.map((m: any) => {
                        const imgThumb = m.thumbnail_url && m.thumbnail_url !== m.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.thumbnail_url) ? m.thumbnail_url : null
                        const code = stagedExpiry[m.id]
                        const isDoc = !!m.kind && !['image', 'video', 'audio'].includes(m.kind)
                        return (
                          <div key={m.id} title={m.title || 'media'} style={{ position: 'relative', width: 64, height: 64, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: m.kind === 'audio' ? 'var(--peach)' : 'var(--canvas)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {m.kind === 'audio'
                              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                              : m.kind === 'video'
                              ? (imgThumb
                                  ? <img src={imgThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                  : <video src={m.url + '#t=0.1'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                              : isDoc
                              ? <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--slate)' }}>{String(m.title || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}</span>
                              : <img src={imgThumb || m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            {m.kind === 'video' && (
                              <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                                </span>
                              </span>
                            )}
                            {!internalMode && code && code !== 'forever' && (
                              <span style={{ position: 'absolute', left: 3, bottom: 3, fontSize: 9.5, fontWeight: 800, padding: '1px 5px', borderRadius: 999, background: 'var(--coral)', color: '#fff' }}>{expiryChip(code)}</span>
                            )}
                            <button type="button" title="Remove" aria-label={`Remove ${m.title || 'attachment'}`}
                              onClick={() => { setStagedMedia(prev => prev.filter((x: any) => x.id !== m.id)); setStagedExpiry(prev => { const n = { ...prev }; delete n[m.id]; return n }) }}
                              style={{ position: 'absolute', top: 3, right: 3, width: 20, height: 20, borderRadius: '50%', background: 'rgba(15,17,25,0.65)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {stagedMedia.length <= 3 && stagedMedia.map((m: any) => {
                    const imgThumb = m.thumbnail_url && m.thumbnail_url !== m.url && !/\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.thumbnail_url) ? m.thumbnail_url : null
                    const code = stagedExpiry[m.id]
                    const isDoc = !!m.kind && !['image', 'video', 'audio'].includes(m.kind)
                    const kindLabel = m.kind === 'video' ? 'Video' : m.kind === 'audio' ? 'Voice note' : isDoc ? (String(m.title || '').split('.').pop()?.toUpperCase().slice(0, 5) || 'File') : 'Image'
                    const keeps = !code || code === 'forever'
                    return (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff' }}>
                        <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', background: m.kind === 'audio' ? 'var(--peach)' : 'var(--canvas)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {m.kind === 'audio'
                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
                            : m.kind === 'video'
                            ? (imgThumb
                                ? <img src={imgThumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <video src={m.url + '#t=0.1'} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
                            : isDoc
                            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            : <img src={imgThumb || m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                          {m.kind === 'video' && (
                            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="#fff"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                              </span>
                            </span>
                          )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title || 'media'}</p>
                          <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{kindLabel}</p>
                        </div>

                        {/* Media-expiry selector — only for customer-facing sends
                            (an internal note is never delivered, so it can't expire). */}
                        {!internalMode && m._fromGallery && (
                          <span title="Already saved in your Colvy gallery" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            From gallery
                          </span>
                        )}
                        {!internalMode && !m._fromGallery && (
                        <div data-expiry-picker style={{ position: 'relative', flexShrink: 0 }}>
                          <button type="button"
                            onClick={() => { setExpiryMenuFor(expiryMenuFor === m.id ? null : m.id); setCustomDateFor(null) }}
                            title="Set when this media expires"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: keeps ? '#fff' : 'var(--peach)', color: keeps ? 'var(--slate)' : 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                            {expiryChip(code)}
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                          </button>
                          {expiryMenuFor === m.id && (
                            <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 180, background: '#fff', borderRadius: 10, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                              {[['forever', 'Keep forever'], ['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days']].map(([val, label]) => (
                                <button key={val} type="button"
                                  onClick={() => { setStagedExpiry(prev => { const n = { ...prev }; if (val === 'forever') delete n[m.id]; else n[m.id] = val; return n }); setExpiryMenuFor(null) }}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: (code === val || (val === 'forever' && keeps)) ? 'var(--peach)' : 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: (code === val || (val === 'forever' && keeps)) ? 700 : 500 }}>
                                  {label}
                                  {(code === val || (val === 'forever' && keeps)) && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                                </button>
                              ))}
                              <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                              {customDateFor === m.id ? (
                                <div style={{ padding: '6px 10px' }}>
                                  <input type="date" autoFocus
                                    min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                                    onChange={e => { if (e.target.value) { setStagedExpiry(prev => ({ ...prev, [m.id]: e.target.value })); setExpiryMenuFor(null); setCustomDateFor(null) } }}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: 12.5, boxSizing: 'border-box' }} />
                                </div>
                              ) : (
                                <button type="button" onClick={() => setCustomDateFor(m.id)}
                                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }}>
                                  Choose a date…
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        )}

                        <button type="button" title="Remove"
                          onClick={() => { setStagedMedia(prev => prev.filter((x: any) => x.id !== m.id)); setStagedExpiry(prev => { const n = { ...prev }; delete n[m.id]; return n }) }}
                          style={{ width: 24, height: 24, borderRadius: 7, background: 'none', color: 'var(--slate)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      </div>
                    )
                  })}

                  {/* Advanced: auto-delete. Only relevant once something expires,
                      and off by default — expiring access alone keeps the
                      original safe in the gallery. */}
                  {anyExpiring && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 2px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={expiryDeleteMode} onChange={e => setExpiryDeleteMode(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--coral)' }} />
                      <span style={{ fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--ink)' }}>Delete from Colvy after expiry</span>{' '}— permanently removes the media from your gallery too, not just the recipient's access.
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* Smart prompt: a recent message reads like a payment — offer to log
                  the sale. Suppressed once a sale is recorded for this thread or the
                  customer already matches an ecommerce order (already on record). */}
              {/* Scheduled replies on this conversation — what's queued, when it
                  goes, and Edit / Send now / Delete for each. */}
              {selected && scheduledList.length > 0 && (
                <div className="sched-list" style={{ margin: '0 0 8px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--canvas, #fafafa)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', fontSize: 11.5, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                    Scheduled · {scheduledList.length}
                  </div>
                  <div style={{ maxHeight: 168, overflowY: 'auto' }}>
                    {scheduledList.map(sm => {
                      const busy = scheduledBusy === sm.id
                      const failed = sm.status === 'failed'
                      const sending = sm.status === 'sending'
                      return (
                        <div key={sm.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid var(--border)', background: '#fff', flexWrap: 'wrap', opacity: busy ? 0.6 : 1, transition: 'opacity .2s ease' }}>
                          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12.5, fontWeight: 800, color: failed ? '#dc2626' : 'var(--ink)' }}>{failed ? 'Couldn’t send' : sending ? 'Sending…' : scheduledWhen(sm.scheduled_for)}</span>
                              {sm.channel && <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, background: 'var(--peach, #fff1ee)', color: 'var(--coral)', textTransform: 'uppercase' }}>{String(sm.channel) === 'widget' ? 'Chat' : sm.channel}</span>}
                            </div>
                            <div style={{ fontSize: 12.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }} title={sm.message}>{sm.message}</div>
                          </div>
                          {!sending && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <button type="button" className="sched-btn" disabled={busy}
                                onClick={() => setEditingScheduled({ id: sm.id, message: sm.message || '', at: toLocalInput(failed && new Date(sm.scheduled_for).getTime() < Date.now() + 60000 ? new Date(Date.now() + 3600000).toISOString() : sm.scheduled_for) })}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                                Edit
                              </button>
                              <button type="button" className="sched-btn primary" disabled={busy} onClick={() => sendScheduledNow(sm)}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                {busy ? 'Sending…' : failed ? 'Retry now' : 'Send now'}
                              </button>
                              <button type="button" className="sched-btn icon" disabled={busy} onClick={() => deleteScheduled(sm)} title="Delete" aria-label="Delete scheduled message">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* SMS upsell — shown exactly when an agent could be texting this
                  customer (a mobile is on file) but the plan doesn't include SMS.
                  This is the highest-intent moment to convert, so link straight to
                  the upgrade page. */}
              {selected && !internalMode && !smsIncluded && !!smsDestination() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg, #fff1ee 0%, #ffe9f0 100%)', border: '1px solid #ffd0c4' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>💬</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#9a3412', fontWeight: 600, lineHeight: 1.4 }}>
                    Reply by text and reach {contact?.name ? contact.name.split(' ')[0] : 'this customer'} on their phone — SMS isn’t on your current plan.
                  </span>
                  <a href="/admin/upgrade"
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--coral, #ff7a6b)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Enable SMS
                  </a>
                </div>
              )}
              {selected && !internalMode && smsCreditError && (
                <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '10px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#991b1b', fontWeight: 600, lineHeight: 1.4 }}>
                    Your text wasn’t sent. {smsCreditError}
                  </span>
                  <a href="/admin/billing#sms-credits"
                    style={{ padding: '7px 14px', borderRadius: 8, background: 'var(--coral, #ff7a6b)', color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Top up
                  </a>
                  <button type="button" onClick={() => setSmsCreditError('')} aria-label="Dismiss"
                    style={{ border: 'none', background: 'none', color: '#991b1b', cursor: 'pointer', padding: 2, display: 'flex' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              )}
              {/* Opted out: staff can still type a text (a reply they were asked
                  for), but they should know. Automatic texts are blocked. */}
              {selected && !internalMode && outboundChannel === 'sms' && (smsOptOut === 'opted_out' || (contact as any)?.unsubscribed_at || (contact as any)?.is_blocked) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '9px 12px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>⛔</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#991b1b', fontWeight: 600, lineHeight: 1.4 }}>
                    {(contact as any)?.is_blocked ? 'This customer is blocked.' : 'This customer opted out of texts (they replied STOP).'} Automatic texts to them are stopped — only text them if they’ve asked you to.
                  </span>
                </div>
              )}
              {/* WhatsApp: the 24-hour window, opt-outs, and templates once it has closed. */}
              {selected && !internalMode && sendChannel === 'auto' && outboundChannel === 'whatsapp' && (
                <WhatsAppComposerBar conversationId={selected.id} refreshKey={lastInboundId} contactName={contact?.name || null} agentName={myName}
                  onSent={async () => { if (await reloadThread(selected.id)) scrollBottom() }} onError={t => showToast(t)} />
              )}
              {selected && paymentSignal && !saleDismissed.has(selected.id) && !convHasSale && wooOrders.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '9px 12px', borderRadius: 10, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>💰</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#065f46', fontWeight: 600 }}>Looks like a payment — did this convert to a sale?</span>
                  <button type="button" onClick={() => { dismissSalePrompt(selected.id); setShowRecordSale(true) }}
                    style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Yes, record</button>
                  <button type="button" onClick={() => dismissSalePrompt(selected.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #a7f3d0', background: '#fff', color: '#065f46', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>Not now</button>
                </div>
              )}
              {!internalMode && <AiDraftInfo info={aiDraft.info} error={aiDraft.error} busy={aiDraft.busy} onRedo={i => aiDraft.run(i)} onClose={aiDraft.clear} />}
              {!internalMode && <TranslateStrip t={replyTr} suggested={customerLanguage(messages)} hasText={!!reply.trim()} />}

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

              {agentTyping && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', marginBottom: 8 }}>
                  <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    {[0, 1, 2].map(i => (
                      <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#8b5cf6', animation: `typingDot 1.2s ${i * 0.15}s infinite` }} />
                    ))}
                  </span>
                  <p style={{ margin: 0, fontSize: 12, color: '#7c3aed', fontStyle: 'italic', fontWeight: 600 }}>{agentTyping} is typing…</p>
                </div>
              )}

              <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }}
                onChange={e => { handleFileUpload(e.target.files); e.target.value = '' }} />

              <div className={`cmp-card${internalMode ? ' note' : ''}`}>
                {renderModeHead()}
              <textarea ref={textareaRef} value={reply} onChange={e => {
                  const v = e.target.value
                  setReply(v)
                  if (v.trim()) broadcastAgentTyping()
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
                  ? 'Write a note for your team — @ to mention someone'
                  : `Reply to ${contact?.name ? contact.name.split(' ')[0] : 'customer'}…`}
                className="cmp-input"
                style={{ width: '100%', height: composerH, padding: '4px 16px 8px', border: 'none', background: 'transparent', fontStyle: internalMode ? 'italic' : 'normal', fontSize: 14, lineHeight: 1.5, resize: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', display: 'block', color: 'var(--ink)' }} />

              <div className="composer-bar cmp-bar">
                <div className="composer-tools cmp-tools">
                  {/* Colvy Voice — dictate into the reply (Whispr-Flow style). */}
                  <VoiceDictationButton
                    size={34}
                    soft
                    title="Voice type"
                    keyterms={[contact?.name, (contact as any)?.company_name].filter(Boolean) as string[]}
                    onText={(t) => { dictatedRef.current.push(t); setReply(prev => (prev.trim() ? prev.replace(/\s*$/, ' ') : '') + t) }}
                  />
                  {renderSendMenu(false)}
                  {/* Attach */}
                  <button type="button" className="cmp-tool" onClick={() => fileInputRef.current?.click()} title="Attach a file" aria-label="Attach a file"
                    style={toolBtn()}>
                    {<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                  </button>
                  {/* Gallery */}
                  <button type="button" className="cmp-tool" onClick={openMediaPicker} title="Send from gallery" aria-label="Send from gallery"
                    style={toolBtn()}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                  </button>
                  {/* Emoji */}
                  <button type="button" ref={emojiBtnRef} className="cmp-tool" onClick={() => setShowEmoji(v => !v)} title="Emoji" aria-label="Emoji" aria-haspopup="dialog" aria-expanded={showEmoji}
                    style={toolBtn(showEmoji)}>{Icon.smile(17)}</button>
                  {!internalMode && <TranslateButton t={replyTr} suggested={customerLanguage(messages)} className="cmp-tool" style={toolBtn(!!replyTr.done)} />}
                  {renderLinkTools(false)}
                </div>
                <div className="cmp-send">
                  {!internalMode && <AiDraftButton orb height={38} busy={aiDraft.busy} onClick={() => aiDraft.run()} />}
                  <button type="button" className="cmp-tool cmp-resolve" onClick={() => setStatus('resolved')} title="Resolve conversation" aria-label="Resolve conversation"
                    style={{ ...toolBtn(false, { bg: '#ecfdf3', c: '#059669' }), width: 38, height: 38 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16 9.8"/></svg>
                  </button>
                  {/* Send + channel selector */}
                  <div ref={channelMenuRef} style={{ position: 'relative', display: 'flex' }}>
                    <button type="button" onClick={sendReply} disabled={sending || (!reply.trim() && stagedMedia.length === 0)}
                      style={{ height: 38, padding: '0 18px', borderRadius: internalMode ? 12 : '12px 0 0 12px', background: (!reply.trim() && stagedMedia.length === 0) ? '#e5e7eb' : internalMode ? '#f59e0b' : (themeGradient || 'var(--coral)'), color: (reply.trim() || stagedMedia.length) ? '#fff' : '#9ca3af', border: 'none', fontSize: 13, fontWeight: 700, cursor: (reply.trim() || stagedMedia.length) ? 'pointer' : 'default', transition: 'all 0.15s' }}>
                      {sending
                        ? (internalMode ? 'Saving…' : 'Sending…')
                        : internalMode
                          ? 'Add note'
                          : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              Send {sendChannelGlyph(sendChannel !== 'auto' ? sendChannel : outboundChannel, 15)}
                            </span>
                          )}
                    </button>
                    {!internalMode && (
                    <>
                    <button type="button" onClick={() => setShowChannelMenu(v => !v)} disabled={sending}
                      title="Choose a channel"
                      style={{ height: 38, padding: '0 10px', borderRadius: '0 12px 12px 0', background: (reply.trim() || stagedMedia.length) ? themeSolid : '#e5e7eb', color: (reply.trim() || stagedMedia.length) ? '#fff' : '#9ca3af', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>

                    {showChannelMenu && (
                      <div style={{ position: 'absolute', bottom: '120%', right: 0, width: 190, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.14)', zIndex: 60, overflow: 'hidden', padding: '4px 0' }}>
                        <button type="button" onClick={() => { setShowChannelMenu(false); sendAndClose() }} disabled={sending || (!reply.trim() && stagedMedia.length === 0)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: (reply.trim() || stagedMedia.length) ? 'var(--ink)' : '#9ca3af', fontWeight: 600 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/></svg>
                          Send &amp; close
                        </button>
                        <button type="button" onClick={() => { setShowChannelMenu(false); openScheduleMsg() }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
                          Schedule message
                        </button>
                        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
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
              </div>
              <div className="cmp-hint">
                <span><kbd>Enter</kbd> to send</span><span><kbd>Shift</kbd> + <kbd>Enter</kbd> new line</span>{internalMode ? <span><kbd>@</kbd> mention</span> : <span><kbd>/</kbd> quick replies</span>}
              </div>
              </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── RIGHT: About Colvy, beside the Colvy chat ─────────────────────── */}
      {!selected && colvyOpen && <ColvyChatInfo />}

      {/* ── RIGHT: Contact info + Page history ─────────────────────────────── */}
      {selected && (
        <>
        <div className="inbox-tablet-scrim" onClick={() => setTabletContact(false)} aria-hidden />
        <div className="inbox-col-contact" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tablet: close the drawer */}
          <button type="button" className="inbox-tablet-only inbox-drawer-close" onClick={() => setTabletContact(false)} aria-label="Close contact panel" title="Close"
            style={{ display: 'none', position: 'absolute', top: 10, right: 10, zIndex: 2, width: 32, height: 32, borderRadius: 999, border: 'none', background: '#f3f4f6', color: 'var(--slate)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
          {/* Mobile: back to thread */}
          <button type="button" className="inbox-mobile-only" onClick={() => setMobilePane('thread')}
            style={{ display: 'none', alignItems: 'center', gap: 6, padding: '10px 14px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontSize: 13, fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back to conversation
          </button>
          {/* Panel tabs */}
          <div className="cp-tabs" role="tablist" aria-label="Contact panel">
            {/* The Orders tab used to appear only once orders had finished
                loading (wooCustomer || wooOrders.length), so on first open it was
                missing and you had to click Timeline to trigger the load before
                it showed. Always render it; it shows its own empty state. */}
            {(['info', 'timeline', 'orders'] as const).map(p => (
              <button key={p} type="button" role="tab" aria-selected={activePanel === p} onClick={() => setActivePanel(p)} className={`cp-tab${activePanel === p ? ' on' : ''}`}>
                {p === 'info' ? 'Information' : p === 'timeline' ? 'Timeline' : 'Orders'}
              </button>
            ))}
          </div>

          {/* + Action button — shows enabled conversation actions */}
          {(() => {
            const enabledActions = Object.entries(convActions).filter(([, v]: any) => v?.enabled)
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
              <div style={{ padding: '12px 14px 4px', position: 'relative' }}>
                <button type="button" onClick={() => setShowActionMenu(v => !v)} aria-expanded={showActionMenu} className={`cp-action${showActionMenu ? ' on' : ''}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Action
                </button>
                {showActionMenu && (
                  <div className="th-menu" style={{ position: 'absolute', top: '100%', left: 14, right: 14, zIndex: 20, marginTop: 2 }}>
                    {/* Record sale — always available, and can be used multiple times. */}
                    <button type="button" onClick={() => { setShowActionMenu(false); setShowRecordSale(true) }}
                      className="th-menu-row cp-act-row">
                      <span style={{ color: 'var(--coral)', display: 'inline-flex' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                      </span> Record sale
                    </button>
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
                          className="th-menu-row cp-act-row">
                          <span style={{ color: 'var(--coral)', display: 'inline-flex' }}>{meta.icon(16)}</span> {meta.label}
                        </button>
                      )
                    })}
                  </div>
                )}
                {doaMatch && convActions.doa?.enabled && (
                  <button type="button" onClick={() => setShowDoa(true)} className="cp-hint" title="Start a DOA claim for this customer's order">
                    <span className="cp-hint-ic">{Icon.box(15)}</span>
                    <span style={{ flex: 1, minWidth: 0 }}><b style={{ fontWeight: 650, color: '#18181b' }}>Matches an order</b> · DOA claim</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ color: '#a1a1aa' }}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                )}
              </div>
            )
          })()}

          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px' }}>
            {activePanel === 'info' && (
              <>
                {/* Cross-channel customer match — links an Instagram/Messenger/
                    WhatsApp visitor to an existing customer (masked until confirmed). */}
                {selected && ['instagram', 'facebook', 'whatsapp'].includes(String((selected as any).channel || '')) && (
                  <CustomerMatchCard
                    conversationId={selected.id}
                    channel={(selected as any).channel}
                    companyId={companyId}
                    userId={user?.id}
                    userName={myName}
                    onLinked={async () => {
                      // Confirming a match repoints conversations.contact_id to the
                      // customer, so re-fetch the row (the local `selected` still
                      // holds the old visitor id) before reloading the panel.
                      try {
                        const { data } = await (supabase as any).from('conversations').select('*').eq('id', selected.id).maybeSingle()
                        await selectConversation(data || selected)
                      } catch { await selectConversation(selected) }
                    }}
                  />
                )}
                {/* Coax-style contact card header */}
                {contact && !showContactEdit && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '4px 0 16px', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
                    {(contact as any).avatar_url ? (
                      <img src={(contact as any).avatar_url} alt={contact.name || ''} style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>
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
                    <h3 style={{ margin: '12px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--ink)', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: 'center' }}>{contact.name || contact.email || 'Visitor'}</h3>
                    {(contact as any).is_blocked && (
                      <span style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', padding: '3px 9px', borderRadius: 20 }}>
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
                        {showCardAssign && (() => {
                          const q = cardAssignSearch.trim().toLowerCase()
                          const matches = teamMembers.filter((m: any) => !q || (m.name || '').toLowerCase().includes(q))
                          const mine = teamMembers.find((m: any) => m.user_id && m.user_id === user?.id)
                          const row = (m: any, label?: string) => {
                            const cur = selected?.assigned_to === m.user_id
                            return (
                              <button key={(label ? 'me-' : '') + m.id} type="button" onClick={() => { assignTo(m); setShowCardAssign(false) }} className={`th-menu-row${cur ? ' cur' : ''}`}>
                                <span className="th-av sm">{m.name?.charAt(0).toUpperCase()}</span>
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label || m.name}</span>
                                {cur && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-label="Assigned"><polyline points="20 6 9 17 4 12"/></svg>}
                              </button>
                            )
                          }
                          return (
                            <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 240, zIndex: 70, textAlign: 'left', transformOrigin: 'top left' }}>
                              <div style={{ position: 'relative' }}>
                                <input autoFocus value={cardAssignSearch} onChange={e => setCardAssignSearch(e.target.value)} placeholder="Find a teammate" aria-label="Find a teammate" className="th-menu-search" />
                                {cardAssignSearch && (
                                  <button type="button" onClick={() => setCardAssignSearch('')} aria-label="Clear"
                                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                )}
                              </div>
                              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                {mine && !q && <>{row(mine, 'Assign to me')}<div className="th-menu-sep" /><p className="th-menu-label">Teammates</p></>}
                                {matches.map(m => row(m))}
                                {matches.length === 0 && <p style={{ margin: 0, padding: '10px', fontSize: 13, color: '#9ca3af' }}>No teammates match.</p>}
                                {selected?.assigned_to && !q && <><div className="th-menu-sep" /><button type="button" onClick={() => { assignTo(null); setShowCardAssign(false) }} className="th-menu-row danger">Unassign</button></>}
                              </div>
                            </div>
                          )
                        })()}
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
                          <div className="th-menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 220, zIndex: 70, textAlign: 'left' }}>
                            <button type="button" onClick={() => { setShowCardMore(false); reportSpam() }}
                              className="th-menu-row" style={{ color: '#c2410c' }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                              Report spam
                            </button>
                            <button type="button" onClick={() => { setShowCardMore(false); toggleBlockContact() }}
                              className="th-menu-row" style={{ color: (contact as any).is_blocked ? '#059669' : '#dc2626' }}>
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
                      <button type="button" title="Edit all details" aria-label="Edit all details" onClick={() => { setShowContactEdit(true); setEditContact(contact) }}
                        className="th-btn" style={{ width: 30, height: 30 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                    )}
                    {(showContactEdit || !contact) && (
                      <button type="button" onClick={() => { setShowContactEdit(v => !v); setEditContact(contact || ((selected as any)?.sms_number ? { phone: (selected as any).sms_number } : {})) }}
                        className={`cp-mini${showContactEdit ? '' : ' accent'}`}>
                        {showContactEdit ? 'Cancel' : '+ Create'}
                      </button>
                    )}
                  </div>
                </div>

                {showContactEdit ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Fill blank fields from the linked WooCommerce order's
                        billing — recovers name / phone / address when the order
                        matched the contact only by email and left them empty. */}
                    {(() => {
                      const b = orderBilling
                      if (!b) return null
                      const billingName = `${b.first_name || ''} ${b.last_name || ''}`.trim()
                      const billingAddr = [b.address_1, b.address_2].filter(Boolean).join(', ')
                      const ec: any = editContact
                      const canFill = (!ec.name && billingName) || (!ec.phone && b.phone) || (!ec.address && billingAddr) || (!ec.company_name && b.company)
                      if (!canFill) return null
                      return (
                        <button type="button" onClick={() => setEditContact((c: any) => ({
                          ...c,
                          name: c.name || billingName || c.name,
                          phone: c.phone || b.phone || c.phone,
                          address: c.address || billingAddr || c.address,
                          city: c.city || b.city || c.city,
                          state: c.state || b.state || c.state,
                          postcode: c.postcode || b.postcode || c.postcode,
                          country: c.country || b.country || c.country,
                          company_name: c.company_name || b.company || c.company_name,
                        }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: '1px dashed var(--coral)', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Fill from order
                        </button>
                      )
                    })()}
                    {[['name', 'Name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'], ['address', 'Address', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['postcode', 'Postcode', 'text'], ['country', 'Country', 'text']].map(([field, label, type]) => (
                      <div key={field}>
                        <label style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 3 }}>{label}</label>
                        {field === 'address' ? (
                          // Address lookup (keyless by default; Google when a key is
                          // set). Picking a suggestion fills the street line and
                          // splits city/state/postcode/country into their own fields.
                          // The custom dropdown never blocks typing.
                          <AddressAutocomplete value={(editContact as any).address || ''}
                            onChange={v => setEditContact(c => ({ ...c, address: v }))}
                            onSelect={(parts) => setEditContact(c => ({
                              ...c,
                              address: parts.line1 || parts.formatted,
                              city: parts.city || (c as any).city,
                              state: parts.state || (c as any).state,
                              postcode: parts.postcode || (c as any).postcode,
                              country: parts.country || (c as any).country,
                            }))}
                            style={{ ...inp, fontSize: 12 }} />
                        ) : (
                          <input type={type} value={(editContact as any)[field] || ''} onChange={e => setEditContact(c => ({ ...c, [field]: e.target.value }))}
                            style={{ ...inp, fontSize: 12 }} />
                        )}
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 3 }}>Relationship</label>
                      <select
                        value={(editContact as any).relationship_type || 'customer'}
                        onChange={e => {
                          const rt = e.target.value
                          // A non-customer (supplier/wholesaler/business) is excluded
                          // from marketing by default.
                          setEditContact(c => ({ ...c, relationship_type: rt, ...(rt === 'customer' ? {} : { subscribed_to_marketing: false }) }))
                        }}
                        style={{ ...inp, fontSize: 12, cursor: 'pointer' }}>
                        <option value="customer">Customer</option>
                        <option value="supplier">Supplier</option>
                        <option value="wholesaler">Wholesaler</option>
                        <option value="business">Business contact</option>
                      </select>
                    </div>
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
                    <button type="button" onClick={saveContact} disabled={savingContact} className="cv-btn cv-btn-primary" style={{ width: '100%' }}>
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
                      // Join the parts, but skip any that the address line
                      // already contains — otherwise a Google-formatted address
                      // ("33 Magnesium St, Narangba QLD 4504, Australia") plus a
                      // separately stored city and country rendered as
                      // "…, Australia, Narangba, Australia".
                      const ownAddress = joinAddressParts(
                        addrToString(contact.address),
                        (contact as any).city,
                        (contact as any).state,
                        (contact as any).postcode,
                        (contact as any).country,
                      )
                      let addressValue = ownAddress
                      let addressFromOrder = false
                      if (!ownAddress && wooOrders.length > 0) {
                        const b = wooOrders.find((o: any) => o.billing?.address_1)?.billing
                        if (b) {
                          addressValue = joinAddressParts(b.address_1, b.address_2, b.city, b.state, b.postcode, b.country)
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
                            || joinAddressParts(c.address_1 || c.billing_address_1, c.city || c.billing_city, c.state || c.billing_state, c.postcode || c.billing_postcode)
                          addressFromOrder = true
                        }
                      }
                      return ([
                      ['name', 'Name', contact.name],
                      // The contacts table column is `company_name` (there is no
                      // `company` column); keying this row on `company` made every
                      // save write a non-existent column, so it silently reverted.
                      ['company_name', 'Company', (contact as any).company_name],
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
                          <p style={{ margin: '0 0 2px 0', fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {label}
                            {showOrderTag && <span style={{ fontSize: 8.5, color: '#2563eb', background: '#eef4ff', padding: '1px 5px', borderRadius: 10, letterSpacing: 0 }}>from order</span>}
                          </p>
                          {editField === field ? (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {field === 'address' ? (
                                <div style={{ flex: 1 }}>
                                  <AddressAutocomplete value={editFieldValue}
                                    onChange={setEditFieldValue}
                                    onSelect={(parts) => { setEditFieldValue(parts.formatted); saveSingleField('address', parts.formatted) }}
                                    style={{ ...inp, fontSize: 12, padding: '5px 8px' }} />
                                </div>
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
                                <span className="ai-tip" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, whiteSpace: 'nowrap', background: '#1a1a1a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '5px 9px', borderRadius: 7, opacity: 0, pointerEvents: 'none', transition: 'opacity 0.12s', zIndex: 20 }}>
                                  Colvy AI saved this {label.toLowerCase()}
                                </span>
                              </span>
                            )}
                            <p style={{ margin: 0, fontSize: 13, color: value ? 'var(--ink)' : '#c0c0c5', flex: 1, wordBreak: 'break-word', fontStyle: value ? 'normal' : 'italic', cursor: 'pointer' }}
                               title="Click to edit"
                               onClick={() => { setEditField(field); setEditFieldValue(value || '') }}>
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
                              <button type="button" title="Delete" onClick={async () => { if (await confirmDialog(`Clear ${label.toLowerCase()}?`)) { await (supabase as any).from('contacts').update({ [field]: null }).eq('id', contact.id); setContact((c: any) => ({ ...c, [field]: null })); showToast('Cleared') } }} style={fieldBtn('#dc2626')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                              </button>
                            </div>
                          </div>
                          )}
                        </div>
                        )
                      })
                    })()}

                    {/* ── Google review ─────────────────────────────────────
                        Stars for a review this customer left on Google (linked
                        by contact match). Clicking opens the reviews dashboard. */}
                    {contactReviews.count > 0 && contactReviews.latest && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                        <p style={{ margin: '0 0 3px 0', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Google review</p>
                        <a href="/admin/reviews" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }} title="View on the reviews dashboard">
                          <span style={{ fontSize: 15, letterSpacing: 1, color: '#f5b301' }}>
                            {'★'.repeat(Math.max(0, Math.min(5, contactReviews.latest.rating || 0)))}
                            <span style={{ color: '#d4d4d8' }}>{'★'.repeat(5 - Math.max(0, Math.min(5, contactReviews.latest.rating || 0)))}</span>
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                            {contactReviews.latest.rating}/5{contactReviews.count > 1 ? ` · ${contactReviews.count} reviews` : ''}
                          </span>
                        </a>
                        {contactReviews.latest.comment && (
                          <p style={{ margin: '5px 0 0 0', fontSize: 12, color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            “{contactReviews.latest.comment}”
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Social comment ────────────────────────────────────
                        This customer commented on a post/ad (any linked channel);
                        opens the comment in the Social Engagement manager. */}
                    {contactReviews.commentCount > 0 && contactReviews.latestComment && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                        <p style={{ margin: '0 0 3px 0', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Social engagement</p>
                        <a href={`/admin/social?comment=${encodeURIComponent(contactReviews.latestComment.id)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }} title="View on the Social Engagement manager">
                          <span style={{ fontSize: 13 }}>💬</span>
                          <span style={{ fontSize: 12, color: 'var(--slate)' }}>
                            Commented on {contactReviews.latestComment.platform === 'instagram' ? 'Instagram' : 'Facebook'}{contactReviews.commentCount > 1 ? ` · ${contactReviews.commentCount}` : ''}
                          </span>
                        </a>
                        {contactReviews.latestComment.message && (
                          <p style={{ margin: '5px 0 0 0', fontSize: 12, color: 'var(--ink)', fontStyle: 'italic', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            “{contactReviews.latestComment.message}”
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Preferred agent ───────────────────────────────────
                        When this customer calls, ring this team member first;
                        on no answer the call still rings everyone else. */}
                    {contact && (
                      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                        <label style={{ fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 5 }}>Preferred agent</label>
                        <select
                          value={(contact as any).preferred_agent_user_id || ''}
                          onChange={async (e) => {
                            const uid = e.target.value || null
                            const nm = uid ? (teamMembers.find((m: any) => m.user_id === uid)?.name || null) : null
                            setContact((c: any) => ({ ...c, preferred_agent_user_id: uid, preferred_agent_name: nm }))
                            try {
                              await (supabase as any).from('contacts').update({ preferred_agent_user_id: uid, preferred_agent_name: nm }).eq('id', contact.id)
                              showToast(uid ? `${nm} will ring first for this customer` : 'Preferred agent cleared')
                            } catch { showToast('Could not save preferred agent') }
                          }}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, background: '#fff', color: 'var(--ink)', outline: 'none' }}>
                          <option value="">No preference — ring everyone</option>
                          {teamMembers.map((m: any) => (<option key={m.user_id} value={m.user_id}>{m.name}</option>))}
                        </select>
                        <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--slate)', lineHeight: 1.5 }}>On an incoming call from this customer, this person rings first; if they don’t pick up, everyone else rings.</p>
                      </div>
                    )}

                    {/* ── Super-Admin: workspaces this contact administers ───
                        Renders only for a platform super-admin (the lookup API
                        403s for everyone else). Links to the company's detail in
                        the Console. */}
                    {/* ── Back-in-stock waitlist ──────────────────────────────
                        Customer asked for something out of stock? Put them on
                        its waitlist — they get one SMS when it's back. */}
                    <WaitlistQuickAdd companyId={companyId} contact={contact as any} conversationId={selected?.id || null} />

                    <SuperAdminContactWorkspaces email={(contact as any)?.email || null} />

                    {/* ── Notes ─────────────────────────────────────────────
                        The same conversation_notes shown in the Timeline tab —
                        one store, two locations, with @mention + edit/copy/delete
                        and synced to mobile. Replaces the old single contact.notes
                        field. */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      {renderNotesSection()}
                    </div>

                    {/* ── Tasks ─────────────────────────────────────────────
                        Same conversation_tasks as the Timeline tab, shown here
                        below Notes with assignment + @mention + copy/edit/delete. */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      {renderTasksSection()}
                    </div>

                    {/* ── Delivery (Coax-style) ─────────────────────────────
                        Scheduled delivery date + status, saved inline. */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                      <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {Icon.calendar(12)} Scheduled delivery
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
                      <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'flex', alignItems: 'center', gap: 5 }}>
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

                      {/* Send the customer a tracking link once dispatched. */}
                      <button type="button" onClick={() => setShowTracking(true)}
                        className="cv-btn" style={{ marginTop: 8, width: '100%', height: 36, fontSize: 13 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                        </svg>
                        Send tracking
                      </button>
                    </div>

                    {contact.subscribed_to_marketing && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✓ Subscribed to marketing</span>}
                    <Link href={`/admin/customers/profile?id=${contact.id}`}
                      style={{ fontSize: 12, color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>
                      View full profile →
                    </Link>
                    <style>{`.contact-field-row:hover .contact-field-actions { opacity: 1 !important; }`}</style>
                  </div>
                ) : (
                  (selected as any)?.sms_number ? (
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Phone</p>
                      <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--ink)' }}>{(selected as any).sms_number}</p>
                      <p style={{ fontSize: 12.5, color: '#9ca3af', margin: 0 }}>Not saved as a contact yet. Click &ldquo;+ Create&rdquo; to add their name and details.</p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>No contact linked yet. Click &ldquo;+ Create&rdquo; to create one.</p>
                  )
                )}

                {/* Delivery address book — every address the customer has used,
                    with source + default selection (never overwrites). */}
                {contact && (
                  <CustomerAddresses
                    contactId={contact.id}
                    userName={myName}
                  />
                )}

                {/* Conversation metadata */}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 16, paddingTop: 14 }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Details</h3>

                  {/* Cross-channel identity: every channel this person has used,
                      linked by shared email/phone. Same human, one profile. */}
                  {linkedChannels.length > 1 && (
                    <div style={{ marginBottom: 14, padding: 10, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                      <p style={{ margin: '0 0 7px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Also reachable on</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {linkedChannels.map((lc, i) => {
                          const isCommerce = ['woocommerce', 'pos', 'shopify', 'prexty'].includes(String(lc.channel).toLowerCase())
                          const isCurrent = lc.conversationId && lc.conversationId === selected?.id
                          const clickable = (!!lc.conversationId && !isCurrent) || isCommerce
                          const go = async () => {
                            if (lc.conversationId && !isCurrent) {
                              try {
                                const { data } = await (supabase as any).from('conversations').select('*').eq('id', lc.conversationId).maybeSingle()
                                if (data) await selectConversation(data)
                              } catch {}
                            } else if (isCommerce) {
                              setActivePanel('orders'); setMobilePane('thread')
                            }
                          }
                          return (
                            <button key={i} type="button" disabled={!clickable} onClick={go}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '5px 6px', margin: '0 -6px', borderRadius: 8, border: 'none', background: 'none', cursor: clickable ? 'pointer' : 'default' }}
                              onMouseEnter={e => { if (clickable) e.currentTarget.style.background = '#fff' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                              <span style={{ display: 'flex', flexShrink: 0 }}>{CHANNEL_ICON[String(lc.channel).toLowerCase()] || Icon.chat(14)}</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {CHANNEL_NAME[String(lc.channel).toLowerCase()] || lc.channel}
                                {lc.label ? <span style={{ color: 'var(--slate)' }}> · {lc.label}</span> : null}
                                {isCurrent ? <span style={{ color: '#9ca3af' }}> · current</span> : null}
                              </span>
                              {clickable && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* The customer's whole history — every channel, orders,
                      bookings, calls, payments, tasks and notes — for anyone
                      with a contact, not just people on several channels. */}
                  {contact && (
                    <button type="button" onClick={() => setShowTimeline(true)}
                      className="cv-btn" style={{ marginBottom: 14, width: '100%', height: 36, fontSize: 13 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
                      Customer timeline
                    </button>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Channel</p>
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
                      <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Status</p>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 11px 0 9px', borderRadius: 999, background: STATUS_COLOR[selected.status]?.bg || '#f3f4f6', color: STATUS_COLOR[selected.status]?.color || '#6b7280', fontSize: 12.5, fontWeight: 650, textTransform: 'capitalize' }}>
                        {STATUS_ICON[selected.status] || STATUS_ICON.open}{selected.status}
                      </span>
                    </div>
                    <div>
                      <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Started</p>
                      <p style={{ margin: 0, fontSize: 12, color: 'var(--ink)' }}>{fmtDateTime(selected.updated_at)}</p>
                    </div>
                    {selected.assigned_name && (
                      <div>
                        <p style={{ margin: '0 0 2px', fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Assigned to</p>
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
                                <span>{it.quantity}× {dec(it.name)}{it.sku ? ` (${it.sku})` : ''}</span>
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
                          <button onClick={() => convertAbandonedCart(cart)} className="cv-btn cv-btn-primary" style={{ flex: 1, height: 34, fontSize: 13 }}>Convert to order</button>
                          <button onClick={() => dismissAbandonedCart(cart)} title="Dismiss" className="cv-btn" style={{ height: 34, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Shared media & files — chat attachments PLUS anything that
                    arrived on an email in this thread (images shown as thumbs,
                    other files as document tiles). */}
                {(() => {
                  // Chat image/video keeps the lightbox gallery (indices must
                  // match the thread's gallery source, so this stays separate).
                  const media: any[] = []
                  galleryMessages.forEach(m => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a: any) => {
                    const isImg = a.kind === 'image' || String(a.type||'').startsWith('image'); const isVid = a.kind === 'video' || String(a.type||'').startsWith('video'); if ((isImg || isVid) && a.url) media.push({ ...a, kind: isVid ? 'video' : 'image' })
                  }))
                  // Email attachments (Gmail streams via /api/email/attachment;
                  // webhook emails carry a direct url).
                  const emailAtts: any[] = []
                  galleryMessages.forEach(m => (Array.isArray(m.email_attachments) ? m.email_attachments : []).forEach((a: any, ai: number) => {
                    const url = emailAttachmentUrl(m, a, attToken)
                    if (!url) return
                    const kind = emailAttachmentKind(a)
                    emailAtts.push({ url, thumbUrl: a.thumbUrl || null, name: a.name || 'file', isImage: kind === 'image', isVideo: kind === 'video', messageId: m.id, index: ai })
                  }))
                  const total = media.length + emailAtts.length
                  if (total === 0) return null
                  return (
                    <div style={{ marginTop: 18 }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Shared media &amp; files ({total})</h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {media.map((a, i) => (
                          <div key={`c${i}`}
                            style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: 'var(--canvas)' }}>
                            <div onClick={() => setGalleryIndex(i)} style={{ position: 'absolute', inset: 0 }}>
                              {(a.kind === 'video' || String(a.type).startsWith('video'))
                                // Nothing loads for a video tile until it's opened: its
                                // still stands in, or a play mark on a plain tile.
                                ? <>
                                    <video src={toPublicUrl(a.url)} poster={videoPoster(a)} preload="none" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', background: videoPoster(a) ? '#000' : 'var(--canvas)' }} />
                                    <VideoTileMark />
                                  </>
                                // The stored thumbnail first; older photos without one get
                                // a resized copy (or, failing that, the original).
                                : <img src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(a.url, 120)} onError={sizedImageFallback(a.url)} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                            {/* Forward it to another customer */}
                            <button type="button"
                              onClick={e => { e.stopPropagation(); openForward([a]) }}
                              title="Forward to another contact"
                              style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, backdropFilter: 'blur(3px)' }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                            </button>
                          </div>
                        ))}
                        {emailAtts.map((a, i) => (
                          <a key={`e${i}`} href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}
                            onClick={(a.isImage || a.isVideo) ? (e => { e.preventDefault(); openEmailMedia(a.messageId, a.index) }) : undefined}
                            style={{ position: 'relative', paddingTop: '100%', borderRadius: 8, overflow: 'hidden', background: 'var(--canvas)', display: 'block', textDecoration: 'none', cursor: (a.isImage || a.isVideo) ? 'zoom-in' : 'pointer' }}>
                            {a.isImage ? (
                              <img src={a.thumbUrl ? toPublicUrl(a.thumbUrl) : sizedImageUrl(a.url, 120)} onError={sizedImageFallback(a.url)} alt={a.name} loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : a.isVideo ? (
                              <>
                                <video src={a.url} preload="none" muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: 'var(--canvas)' }} />
                                <VideoTileMark />
                              </>
                            ) : (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4, color: '#64748b' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                <span style={{ fontSize: 9, fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{a.name}</span>
                              </div>
                            )}
                          </a>
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
                    <button type="button" onClick={generateAiSummary} disabled={generatingAi} className="cp-mini violet">
                      {generatingAi ? 'Thinking…' : aiSummary ? 'Regenerate' : 'Generate'}
                    </button>
                  </div>
                  {aiSummary ? (
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                      <Highlight text={aiSummary} q={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} />
                    </p>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>Generate a summary and action items for this conversation.</p>
                  )}
                  {aiTodos.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>To-dos</p>
                      {aiTodos.map((t: any, i: number) => (
                        <label key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12, color: 'var(--ink)', marginBottom: 4, cursor: 'pointer' }}>
                          <input type="checkbox" checked={!!t.done} onChange={() => {
                            const upd = aiTodos.map((x: any, xi: number) => xi === i ? { ...x, done: !x.done } : x)
                            setAiTodos(upd)
                            ;(supabase as any).from('conversations').update({ ai_todos: upd }).eq('id', selected.id)
                              // A query builder only runs once awaited/then'd — without this the tick was never saved.
                              .then(() => {}, () => {})
                          }} style={{ marginTop: 2 }} />
                          <span style={{ textDecoration: t.done ? 'line-through' : 'none', opacity: t.done ? 0.6 : 1 }}>
                            <Highlight text={t.text} q={(showMsgSearch && msgSearch.trim()) ? msgSearch : searchTerm} accent={companyInfo?.accent_color || 'var(--coral)'} />
                          </span>
                        </label>
                      ))}
                      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: '#7c3aed' }}>✨</span> Draft tasks from these appear in the conversation.
                      </p>
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
                    <ReviewRequestButton buttonLabel="Send review request" key={`rvp-${selected?.id || ''}`}
                      buttonStyle={{ fontSize: 11, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', color: 'var(--slate)', fontWeight: 600 }}
                      channel={reviewChannel()} alreadyReviewed={reviewAlready()} getLink={createReviewLink} onSend={sendReviewRequest} onError={showToast}
                      onInsert={showEmailComposer && !internalMode ? undefined : (t => setReply(r => (r.trim() ? r.trimEnd() + '\n' : '') + t))} />
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
                            <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>{d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · {d.toLocaleTimeString([], timeOpts())}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink)' }}>{ev.detail}</p>
                            {ev.actor_name && <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9ca3af' }}>by {ev.actor_name}</p>}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Notes */}
                {renderNotesSection()}

                {/* Tasks */}
                {renderTasksSection()}

                {/* Page history */}
                <div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Page History</h3>
                  {(!selected.page_history || selected.page_history.length === 0) ? (
                    <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No page history recorded yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...selected.page_history].reverse().map((h: any, i: number) => (
                        <div key={i} style={{ padding: '9px 12px', borderRadius: 8, background: 'var(--canvas)', border: i === 0 ? '1.5px solid var(--coral)' : '1px solid var(--border)' }}>
                          {i === 0 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--coral)', display: 'block', marginBottom: 3 }}>Current</span>}
                          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dec(h.title) || 'Untitled'}</p>
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
                {/* Store customer summary (WooCommerce, or Shopify when there's no WooCommerce match) */}
                {wooCustomer && (
                  <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: '1px solid #ddd6fe' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ color: "var(--coral)", display: "inline-flex" }}>{Icon.cart(16)}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>{wooCustomer._channel === 'shopify' ? 'Shopify Customer' : 'WooCommerce Customer'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Total spend</p>
                        <p style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>
                          {(() => {
                            const spend = (parseFloat(wooCustomer.total_spend) || 0) || wooOrders.reduce((s, o) => s + (parseFloat(o.total) || 0), 0)
                            return spend > 0 ? `$${spend.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'
                          })()}
                        </p>
                      </div>
                      <div>
                        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: '#8e8e93' }}>Orders</p>
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

                {/* Prexty POS customer — a compact strip rather than a big tinted
                    block, so the order history below stays the focus. */}
                {prextyCustomer && (() => {
                  const money = (n: any) => `$${Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  const stats = [
                    // Including GST, like every other price in Colvy (Prexty's own figure is before GST).
                    { label: 'Spent inc GST', value: prextyCustomer.totalSpent > 0 || prextyCustomer.totalSpentIncTax > 0
                      ? money(prextySpendIncGst(prextyCustomer, wooOrders.filter((o: any) => o.pos_source === 'prexty' || posSaleInfo(o).isPos)))
                      : '—' },
                    { label: prextyCustomer.totalOrders === 1 ? 'Sale' : 'Sales', value: String(prextyCustomer.totalOrders || 0) },
                    ...(prextyCustomer.loyaltyPoints > 0 ? [{ label: 'Points', value: String(prextyCustomer.loyaltyPoints) }] : []),
                    ...(prextyCustomer.storeCredit > 0 ? [{ label: 'Credit', value: money(prextyCustomer.storeCredit) }] : []),
                  ]
                  const where = [prextyCustomer.city, prextyCustomer.state].filter(Boolean).join(', ')
                  const since = prextyCustomer.memberSince ? new Date(prextyCustomer.memberSince).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' }) : ''
                  return (
                    <div style={{ marginBottom: 16, borderRadius: 12, border: '1px solid var(--border)', background: '#fff', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                        <PrextyMark size={16} />
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Prexty POS</span>
                        {(since || where) && (
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            {since ? `Since ${since}` : where}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${stats.length - 1}, 1fr)` }}>
                        {stats.map((st, i) => (
                          <div key={st.label} style={{ padding: '9px 12px', borderLeft: i ? '1px solid var(--border)' : 'none', minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.value}</p>
                            <p title={st.label} style={{ margin: '1px 0 0', fontSize: 10.5, fontWeight: 600, color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Order history */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Order History ({wooOrders.length})</h3>
                  <button type="button" onClick={() => setShowOrderSearch(v => !v)} title="Search orders" aria-label="Search orders" aria-pressed={showOrderSearch}
                    className={`th-btn${showOrderSearch ? ' on' : ''}`} style={{ width: 30, height: 30 }}>
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
                    wooOrdersLoading ? (
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8z" /></svg>
                        Loading orders…
                      </p>
                    ) : (
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{wooOrders.length === 0 ? "No orders found for this customer's email." : 'No orders match your search.'}</p>
                    )
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filteredOrders.map(o => {
                      const oid = o.order_id || o.woo_order_id || o.id
                      const onum = o.order_number || o.woo_order_id || o.id
                      const payload = { order_id: oid, order_number: onum, total: o.total, currency: o.currency, status: o.status, pay_link: o.payment_url || (o.store_url && o.order_key ? `${o.store_url}/checkout/order-pay/${oid}/?pay_for_order=true&key=${o.order_key}` : null), store_url: o.store_url, integration_id: o.integration_id }
                      return (
                      <div key={oid} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff' }}>
                        {(() => {
                          // Header: number + status on the left, total on the right.
                          // A Prexty in-store sale (V407 columns, or the order's own
                          // meta when it came live from the store) gets its own line
                          // naming the shop and receipt, instead of a pill squeezed
                          // in beside the order number.
                          const pos = o.pos_source === 'prexty' ? { isPos: true, saleId: o.pos_sale_id || '', outlet: o.pos_outlet || '' } : posSaleInfo(o)
                          const shopLoc = pos.isPos ? outlets.find((x: any) => x.id === o.pos_location_id) : null
                          // The short name (suburb) fits the narrow card; the full one is in the tooltip.
                          const shop = pos.isPos ? (shopLoc?.suburb || shopLoc?.label || pos.outlet) : ''
                          const st = String(o.status || '').toLowerCase()
                          const tone = st === 'completed' ? ['#dcfce7', '#059669'] : st === 'processing' ? ['#dbeafe', '#2563eb'] : st === 'cancelled' || st === 'failed' ? ['#fee2e2', '#dc2626'] : st === 'refunded' ? ['#f3e8ff', '#7c3aed'] : ['#fef3c7', '#d97706']
                          const date = o.order_date ? new Date(o.order_date).toLocaleDateString('en-AU') : ''
                          return (
                            <>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>#{onum}</span>
                                  <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 99, background: tone[0], color: tone[1], fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{o.status}</span>
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)', whiteSpace: 'nowrap' }}>${(parseFloat(o.total) || 0).toFixed(2)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                {pos.isPos ? (
                                  <span title={`Prexty POS sale${pos.saleId ? ` ${pos.saleId}` : ''}${shopLoc?.label || pos.outlet ? ` · ${shopLoc?.label || pos.outlet}` : ''}`}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, fontSize: 11, color: 'var(--slate)' }}>
                                    <PrextyMark size={12} />
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      In store{pos.saleId ? <> · <b style={{ color: 'var(--ink)', fontWeight: 700 }}>{pos.saleId}</b></> : null}{shop ? ` · ${shop}` : ''}
                                    </span>
                                  </span>
                                ) : <span />}
                                <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>{date}</span>
                              </div>
                            </>
                          )
                        })()}
                        {Number(o.total_refunded) > 0 && o.status !== 'refunded' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                            <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 6, background: '#f3e8ff', color: '#7c3aed', fontWeight: 700 }}>
                              {Number(o.total_refunded) + 0.005 >= (parseFloat(o.total) || 0) ? 'Refunded' : 'Partially refunded'}
                            </span>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626' }}>−${Number(o.total_refunded).toFixed(2)}</span>
                          </div>
                        )}
                        {Array.isArray(o.line_items) && o.line_items.length > 0 && (() => {
                          const withImg = o.line_items.filter((li: any) => li.image?.src)
                          const images = withImg.map((li: any) => ({ src: li.image.src, name: dec(li.name) }))
                          const openAt = (src?: string) => {
                            if (!images.length) return
                            const idx = src ? Math.max(0, images.findIndex((im: any) => im.src === src)) : 0
                            setOrderGallery({ images, index: idx })
                          }
                          return (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                              {o.line_items.map((li: any, i: number) => {
                                const placeholder = (
                                  <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--canvas)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1' }}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                                  </div>
                                )
                                return (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '3px 0' }}>
                                  {li.image?.src ? (
                                    <ResilientImage src={li.image.src} onClick={(e) => { e.stopPropagation(); openAt(li.image.src) }}
                                      fallback={placeholder}
                                      style={{ width: 34, height: 34, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)', cursor: 'pointer', flexShrink: 0 }} />
                                  ) : placeholder}
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)' }}>{li.quantity}× {dec(li.name)}</p>
                                    {li.sku ? <p style={{ margin: '1px 0 0', fontSize: 9.5, color: '#9ca3af', letterSpacing: '0.02em' }}>SKU: {li.sku}</p> : null}
                                  </div>
                                </div>
                              )})}
                              {images.length > 0 && (
                                <button type="button" onClick={(e) => { e.stopPropagation(); openAt() }}
                                  style={{ marginTop: 6, background: 'none', border: 'none', color: 'var(--coral)', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                                  View {images.length} product image{images.length > 1 ? 's' : ''}
                                </button>
                              )}
                              {(o.shipping_method || o.shipping_total != null) && (
                                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--slate)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span>🚚</span>
                                  {o.shipping_method || 'Shipping'}{Number(o.shipping_total) > 0 ? ` — $${Number(o.shipping_total).toFixed(2)}` : ' — Free'}
                                </p>
                              )}
                            </div>
                          )
                        })()}
                        {/* Per-order actions. Shopify orders get the same actions —
                            the routes see the "shopify-<id>" order id and make the
                            change in Shopify (lib/shopify-order-actions). */}
                        {o._channel === 'shopify' ? (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          {!['cancelled', 'refunded'].includes(String(o.status || '').toLowerCase()) && (
                            <button type="button" onClick={() => openOrderEditor(payload)} style={miniBtn('var(--coral)')}>Edit</button>
                          )}
                          {['processing', 'pending'].includes(String(o.status || '').toLowerCase()) && (
                            <button type="button" onClick={() => markOrderCompleted(payload)} style={miniBtn('#15803d')}>Mark completed</button>
                          )}
                          {['processing', 'completed'].includes(String(o.status || '').toLowerCase()) && (
                            <button type="button" onClick={() => issueOrderRefund(payload)} style={miniBtn('#b45309')}>Issue refund</button>
                          )}
                          <button type="button" onClick={() => generateInvoice(payload)} style={miniBtn('var(--ink)')}>Invoice</button>
                          {o.shop && <a href={`https://${o.shop}/admin/orders/${o.external_order_id}`} target="_blank" rel="noopener noreferrer" style={{ ...miniBtn('#008060'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Open in Shopify</a>}
                          {o.status_url && <button type="button" onClick={() => { navigator.clipboard?.writeText(o.status_url); showToast('Order status link copied') }} style={miniBtn('var(--slate)')}>Copy status link</button>}
                        </div>
                        ) : (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          <button type="button" onClick={() => openOrderEditor(payload)} style={miniBtn('var(--coral)')}>Edit</button>
                          {/* A paid order doesn't need a payment request — the
                              useful action there is refunding it. */}
                          {String(o.status || '').toLowerCase() === 'processing' && (
                            <button type="button" onClick={() => markOrderCompleted(payload)} style={miniBtn('#15803d')}>Mark completed</button>
                          )}
                          {/pickup|collect/i.test(String(o.shipping_method || '')) && (
                            <button type="button"
                              onClick={() => setPickupModal({ payload, locationId: (selected as any)?.assigned_location_id || outlets.find(x => x.is_primary)?.id || outlets[0]?.id || '' })}
                              style={miniBtn('#0891b2')}>Ready for pickup</button>
                          )}
                          {['processing', 'completed'].includes(String(o.status || '').toLowerCase())
                            ? <button type="button" onClick={() => issueOrderRefund(payload)} style={miniBtn('#b45309')}>Issue refund</button>
                            : <button type="button" onClick={() => sendOrderPaymentRequest(payload)} style={miniBtn('#635BFF')}>Payment request</button>}
                          <button type="button" onClick={() => generateInvoice(payload)} style={miniBtn('var(--ink)')}>Invoice</button>
                          {payload.pay_link && <button type="button" onClick={() => { navigator.clipboard?.writeText(payload.pay_link!); showToast('Pay link copied') }} style={miniBtn('var(--slate)')}>Copy link</button>}
                        </div>
                        )}
                      </div>
                    )})}
                  </div>
                  )
                })()}
              </>
            )}
          </div>
        </div>
        </>
      )}
    </div>
  )
}

// Review-request card wrapper: feeds the tracked link's live stats (opens,
// last device / city) into the card's render function.
function ReviewCard({ msg, companyId, render }: { msg: any; companyId: string | null; render: (s: any) => React.ReactNode }) {
  const codes = linkCodesIn(msg?.content).slice(0, 1)
  const [s] = useLinkStats(companyId, codes)
  return <>{render(s || null)}</>
}

