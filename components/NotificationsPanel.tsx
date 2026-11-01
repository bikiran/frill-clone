'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import DeliveryDetailsSheet from '@/components/DeliveryDetailsSheet'
import { supabase } from '@/lib/supabase'
import EmptyScroll from '@/components/EmptyScroll'

// The bell's panel: every notification with a real title and icon, grouped by
// day, filterable by what it's about, with runs of the same thing (a busy
// morning of in-store sales) stacked into one line. Owns its own list; the
// header keeps the unread badge (onUnread) and does the navigation (onOpen).

type N = any
type Cat = 'you' | 'messages' | 'orders' | 'bookings' | 'support' | 'board' | 'system'

const CATS: { key: Cat; label: string }[] = [
  { key: 'you', label: 'For you' },
  { key: 'messages', label: 'Messages' },
  { key: 'orders', label: 'Orders' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'support', label: 'Support' },
  { key: 'board', label: 'Board' },
  { key: 'system', label: 'System' },
]

type Kind = { label: string; color: string; icon: string; cat: Cat; channel?: string }
const KINDS: Record<string, Kind> = {
  chat: { label: 'New chat message', color: '#2563eb', icon: 'chat', cat: 'messages', channel: 'Live chat' },
  sms: { label: 'New text message', color: '#0d9488', icon: 'phone-msg', cat: 'messages', channel: 'Text message' },
  whatsapp: { label: 'New WhatsApp message', color: '#16a34a', icon: 'chat', cat: 'messages', channel: 'WhatsApp' },
  messenger: { label: 'New Messenger message', color: '#2563eb', icon: 'chat', cat: 'messages', channel: 'Messenger' },
  instagram: { label: 'New Instagram message', color: '#db2777', icon: 'chat', cat: 'messages', channel: 'Instagram' },
  email: { label: 'New email', color: '#4f46e5', icon: 'mail', cat: 'messages', channel: 'Email' },
  call: { label: 'Call', color: '#0891b2', icon: 'phone', cat: 'messages' },
  conversation_assigned: { label: 'Conversation assigned to you', color: '#7c3aed', icon: 'user', cat: 'you' },
  mention: { label: 'You were mentioned', color: '#db2777', icon: 'at', cat: 'you' },
  task_assigned: { label: 'Task assigned to you', color: '#9333ea', icon: 'check', cat: 'you' },
  task_comment: { label: 'New comment on a task', color: '#9333ea', icon: 'check', cat: 'you' },
  task: { label: 'Task', color: '#9333ea', icon: 'check', cat: 'you' },
  agent_escalation: { label: 'The AI agent needs you', color: '#e11d48', icon: 'bot', cat: 'you' },
  order: { label: 'New order', color: '#ea580c', icon: 'bag', cat: 'orders' },
  cart: { label: 'Abandoned cart', color: '#d97706', icon: 'cart', cat: 'orders' },
  booking: { label: 'Booking', color: '#0d9488', icon: 'calendar', cat: 'bookings' },
  calendar: { label: 'Calendar reminder', color: '#0284c7', icon: 'calendar', cat: 'bookings' },
  ticket: { label: 'Support ticket', color: '#f2551d', icon: 'ticket', cat: 'support' },
  form: { label: 'New form response', color: '#0d9488', icon: 'form', cat: 'support' },
  integration: { label: 'Integration needs attention', color: '#dc2626', icon: 'plug', cat: 'system' },
  settings: { label: 'Settings', color: '#52525b', icon: 'gear', cat: 'system' },
  announcement: { label: 'New update', color: '#7c3aed', icon: 'megaphone', cat: 'system' },
  activity: { label: 'Activity', color: '#52525b', icon: 'bolt', cat: 'system' },
  help: { label: 'Help article', color: '#0d9488', icon: 'book', cat: 'system' },
  idea: { label: 'Idea', color: '#ca8a04', icon: 'bulb', cat: 'board' },
  vote: { label: 'New vote on your idea', color: '#ca8a04', icon: 'bulb', cat: 'board' },
  comment: { label: 'New comment on your idea', color: '#ca8a04', icon: 'bulb', cat: 'board' },
  reply: { label: 'New reply to your comment', color: '#ca8a04', icon: 'bulb', cat: 'board' },
  status_change: { label: 'Idea status updated', color: '#ca8a04', icon: 'bulb', cat: 'board' },
  assignment: { label: 'You were assigned an idea', color: '#ca8a04', icon: 'bulb', cat: 'board' },
  roadmap: { label: 'Roadmap update', color: '#ca8a04', icon: 'map', cat: 'board' },
}
const kindOf = (n: N): Kind => KINDS[String(n?.type || '')] || { label: 'Update', color: '#52525b', icon: 'bell', cat: 'system' }

const text = (n: N) => String(n?.message || n?.body || '').replace(/^[\p{Extended_Pictographic}️\s]+/u, '').trim()

// A clearer headline than the raw type, read from the message where the
// sender didn't store a title: "In-store sale", "Order completed", "Missed call"…
function titleOf(n: N): string {
  if (n?.title) return String(n.title)
  const m = text(n)
  const k = kindOf(n)
  if (k.channel && n?.actor_name) return String(n.actor_name)
  switch (n?.type) {
    case 'order': {
      if (/^in-store sale/i.test(m)) return 'In-store sale'
      if (/^prexty pos order/i.test(m)) return 'In-store sale'
      if (/^online order/i.test(m)) return 'Online order'
      if (/^order completed/i.test(m)) return 'Order completed'
      if (/^(order )?refund/i.test(m)) return 'Refund'
      if (/^draft order/i.test(m)) return 'Draft order created'
      if (/cancel/i.test(m.slice(0, 40))) return 'Order cancelled'
      if (/^(order|new order)/i.test(m) && /created/i.test(m)) return 'Order created'
      return 'New order'
    }
    case 'call':
      if (/missed/i.test(m)) return 'Missed call'
      if (/voicemail/i.test(m)) return 'New voicemail'
      return 'Call'
    case 'booking':
      if (/cancel/i.test(m)) return 'Booking cancelled'
      if (/reschedul|moved/i.test(m)) return 'Booking moved'
      if (/waitlist/i.test(m)) return 'Waitlist update'
      if (/remind/i.test(m)) return 'Booking reminder'
      return 'New booking'
    case 'ticket':
      if (/sla|overdue|breach/i.test(m)) return 'Ticket needs attention'
      return 'New support ticket'
  }
  return k.label
}

// "In-store sale R50090 at … · #125656 from Chethan Reddy — $92.85" → $92.85
function amountOf(n: N): number | null {
  const m = text(n).match(/[—–-]\s*(?:[A-Z]{3}\s*)?\$\s?([\d,]+(?:\.\d{1,2})?)\s*$/)
  if (!m) return null
  const v = parseFloat(m[1].replace(/,/g, ''))
  return isFinite(v) ? v : null
}
// The detail line: drop what the title already says.
function detailOf(n: N, title: string): string {
  let m = text(n)
  if (n?.type === 'order') m = m.replace(/^(in-store sale|order completed|new order|refund)\s*/i, '').replace(/^·\s*/, '')
  if (amountOf(n) != null) m = m.replace(/\s*[—–-]\s*(?:[A-Z]{3}\s*)?\$\s?[\d,]+(?:\.\d{1,2})?\s*$/, '')
  if (m.toLowerCase() === title.toLowerCase()) return ''
  return m
}
const money = (v: number) => `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ago(iso: string): string {
  const t = new Date(iso).getTime(); if (isNaN(t)) return ''
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  const d = new Date(t)
  if (s < 7 * 86400) return d.toLocaleDateString('en-AU', { weekday: 'short' })
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
function dayLabel(iso: string): string {
  const d = new Date(iso); const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = new Date(d); day.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 864e5)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-AU', { weekday: 'long' })
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}

const PATHS: Record<string, React.ReactNode> = {
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  'phone-msg': <><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M11 18h2" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></>,
  phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  at: <><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  check: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></>,
  bot: <><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4" /><circle cx="9" cy="14" r="1" /><circle cx="15" cy="14" r="1" /></>,
  bag: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="3" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  ticket: <><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2.2a2.8 2.8 0 0 0 0 5.6V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2.2a2.8 2.8 0 0 0 0-5.6z" /></>,
  form: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>,
  plug: <><path d="M9 2v6" /><path d="M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-12 0z" /><path d="M12 17v5" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  megaphone: <><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>,
  bolt: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  bulb: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></>,
  map: <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
}
const Ico = ({ name, size = 16, sw = 2 }: { name: string; size?: number; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name] || PATHS.bell}</svg>
)

const PAGE = 50
const SOUND_KEY = 'colvy-notif-sound'
const BANNER_KEY = 'colvy-notif-alerts-banner-off'
export const notificationSoundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== '0' } catch { return true } }

// ── Deliveries ─────────────────────────────────────────────────────────────
// The team's scheduled deliveries (calendar events of type delivery), one tap
// from the bell: anything overdue and not yet delivered, then today, tomorrow
// and the coming weeks. A row opens the customer's conversation (where the
// "Delivery scheduled" card is), or the calendar when there isn't one.
const DLV_DONE = /^(delivered|completed|cancelled|failed)$/i   // the app stores Delivered as 'completed'
const DLV_STATUS: Record<string, string> = { pending: 'Pending', scheduled: 'Scheduled', out_for_delivery: 'Out for delivery', completed: 'Delivered', delivered: 'Delivered', failed: 'Failed', cancelled: 'Cancelled' }
const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
function deliveryGroups(list: any[]): { label: string; rows: any[] }[] {
  const today = dayStart(new Date()).getTime()
  const out: { label: string; rows: any[] }[] = []
  const push = (label: string, r: any) => { let g = out.find(x => x.label === label); if (!g) { g = { label, rows: [] }; out.push(g) } g.rows.push(r) }
  for (const r of list) {
    const t = dayStart(new Date(r.starts_at)).getTime()
    if (t < today) { if (!DLV_DONE.test(String(r.status || ''))) push('Overdue', r); continue }
    const days = Math.round((t - today) / 864e5)
    push(days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : new Date(r.starts_at).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' }), r)
  }
  return out
}
// "John Scharl · #126730" from "Delivery — John Scharl · #126730".
const deliveryWho = (r: any) => String(r.title || 'Delivery').replace(/^\s*delivery\s*[—–-]\s*/i, '') || 'Delivery'

const CSS = `
  .np { display: flex; flex-direction: column; width: min(420px, calc(100vw - 24px)); max-height: min(680px, calc(100vh - 80px)); background: #fff; border-radius: 22px; box-shadow: 0 24px 64px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.05); overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; animation: npIn .2s cubic-bezier(.22,1,.36,1); transform-origin: top right; }
  @keyframes npIn { from { opacity: 0; transform: translateY(-6px) scale(.98); } to { opacity: 1; transform: none; } }
  .np-head { padding: 16px 12px 12px 20px; display: flex; align-items: center; gap: 8px; }
  .np-head h3 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); flex: 1; display: flex; align-items: center; gap: 8px; }
  .np-n { min-width: 22px; height: 22px; padding: 0 7px; box-sizing: border-box; border-radius: 999px; background: var(--coral); color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; letter-spacing: 0; }
  .np-ic { width: 34px; height: 34px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: transparent; color: #52525b; cursor: pointer; text-decoration: none; transition: background .15s ease, color .15s ease; }
  .np-ic::before { display: none; }
  .np-ic:hover { background: #f4f4f5; color: #18181b; }
  .np-ic:disabled { opacity: .35; cursor: default; background: transparent; }
  .np-bar { padding: 0 16px 10px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid #f0f0f2; }
  .np-seg { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: #f4f4f5; }
  .np-seg button { flex: 1; height: 30px; border: none; border-radius: 999px; background: transparent; color: #52525b; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .np-seg button::before { display: none; }
  .np-seg button.on { background: #fff; color: #18181b; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  .np-seg .c { font-size: 11.5px; font-weight: 700; color: var(--coral); }
  .np-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 0 -16px; padding: 0 16px 2px; }
  .np-chips::-webkit-scrollbar { display: none; }
  .np-chip { flex-shrink: 0; height: 30px; display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .15s ease, color .15s ease; }
  .np-chip::before { display: none; }
  .np-chip:hover { background: #ececef; color: #18181b; }
  .np-chip.on { background: #18181b; color: #fff; }
  .np-chip .d { width: 6px; height: 6px; border-radius: 50%; background: var(--coral); }
  .np-chip .n { min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 999px; background: #059669; color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .np-chip-dlv:not(.on) { color: #047857; background: color-mix(in srgb, #059669 10%, #fff); }
  .np-chip-dlv:not(.on):hover { background: color-mix(in srgb, #059669 16%, #fff); color: #065f46; }
  .np-day.late { color: #dc2626; }
  .np-dlv.done { opacity: .6; }
  .np-dlv-st { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; color: #047857; background: color-mix(in srgb, #059669 12%, transparent); }
  .np-dlv-st.s-out_for_delivery { color: #1d4ed8; background: color-mix(in srgb, #2563eb 12%, transparent); }
  .np-dlv-st.s-pending { color: #b45309; background: color-mix(in srgb, #d97706 13%, transparent); }
  .np-dlv-st.s-failed, .np-dlv-st.s-cancelled { color: #b42318; background: color-mix(in srgb, #dc2626 11%, transparent); }
  .np-dlv-st.s-delivered, .np-dlv-st.s-completed { color: #52525b; background: #f4f4f5; }
  [data-theme="dark"] .np-chip-dlv:not(.on) { color: #6ee7b7; background: color-mix(in srgb, #10b981 16%, #1c1c1f); }
  [data-theme="dark"] .np-dlv-st { color: #6ee7b7; }
  [data-theme="dark"] .np-dlv-st.s-out_for_delivery { color: #93c5fd; } [data-theme="dark"] .np-dlv-st.s-pending { color: #fcd34d; }
  [data-theme="dark"] .np-dlv-st.s-failed, [data-theme="dark"] .np-dlv-st.s-cancelled { color: #fda29b; } [data-theme="dark"] .np-dlv-st.s-delivered, [data-theme="dark"] .np-dlv-st.s-completed { color: #a1a1aa; background: #2a2a2e; }
  .np-list { flex: 1; overflow-y: auto; padding: 4px 8px 8px; overscroll-behavior: contain; }
  .np-day { position: sticky; top: 0; z-index: 1; padding: 12px 12px 6px; font-size: 12.5px; font-weight: 600; color: #8e8e93; background: rgba(255,255,255,.94); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
  .np-item { position: relative; display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 10px 12px; margin-bottom: 2px; border: none; border-radius: 16px; background: transparent; text-align: left; font: inherit; cursor: pointer; transition: background .12s ease; }
  .np-item::before { display: none; }
  .np-item:hover { background: #f7f7f8; }
  .np-item.unread { background: color-mix(in srgb, var(--coral) 6%, #fff); }
  .np-item.unread:hover { background: color-mix(in srgb, var(--coral) 9%, #fff); }
  .np-item:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
  .np-tile { position: relative; width: 38px; height: 38px; flex-shrink: 0; border-radius: 13px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--k) 12%, #fff); color: var(--k); }
  .np-stackn { position: absolute; right: -5px; bottom: -5px; min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 999px; border: 2px solid #fff; background: var(--k); color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; }
  .np-body { flex: 1; min-width: 0; }
  .np-top { display: flex; align-items: baseline; gap: 8px; }
  .np-title { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .np-item.unread .np-title { font-weight: 700; }
  .np-time { flex-shrink: 0; font-size: 12px; color: #a1a1aa; font-variant-numeric: tabular-nums; }
  .np-detail { margin-top: 2px; font-size: 13px; color: #71717a; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .np-meta { margin-top: 6px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .np-amt { height: 22px; display: inline-flex; align-items: center; padding: 0 8px; border-radius: 999px; background: #f0fdf4; color: #15803d; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .np-actor { font-size: 12px; color: #8e8e93; }
  .np-chan { height: 22px; display: inline-flex; align-items: center; gap: 5px; padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--k) 10%, #fff); color: color-mix(in srgb, var(--k) 85%, #000); font-size: 12px; font-weight: 600; }
  .np-chan::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--k); }
  .np-kids .np-title, .np-kids .np-item.unread .np-title { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-weight: 500; font-size: 13.5px; }
  .np-banner .np-ic { width: 28px; height: 28px; }
  .np-dot { position: absolute; top: 16px; right: 12px; width: 8px; height: 8px; border-radius: 50%; background: var(--coral); }
  .np-item.unread .np-time { margin-right: 14px; }
  .np-tools { position: absolute; right: 8px; bottom: 8px; display: flex; gap: 2px; opacity: 0; transition: opacity .12s ease; }
  .np-item:hover .np-tools, .np-item:focus-within .np-tools { opacity: 1; }
  @media (hover: none) { .np-tools { display: none; } }
  .np-tool { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: #fff; color: #52525b; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 1px 3px rgba(0,0,0,.08); }
  .np-tool::before { display: none; }
  .np-tool:hover { color: #18181b; }
  .np-kids { margin: -2px 0 6px 50px; padding-left: 10px; border-left: 2px solid #f0f0f2; }
  .np-kids .np-item { padding: 8px 10px; }
  .np-more { display: flex; justify-content: center; padding: 8px 0 4px; }
  .np-btn { height: 34px; display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap; }
  .np-btn::before { display: none; }
  .np-btn:hover { background: #ececef; }
  .np-btn.primary { background: var(--coral); color: #fff; }
  .np-banner { margin: 10px 16px 0; padding: 10px 10px 10px 12px; border-radius: 16px; background: #f4f4f5; display: flex; align-items: center; gap: 10px; font-size: 13px; color: #3f3f46; line-height: 1.35; }
  .np-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px 10px 18px; border-top: 1px solid #f0f0f2; }
  .np-switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #52525b; cursor: pointer; user-select: none; }
  .np-switch input { position: absolute; opacity: 0; pointer-events: none; }
  .np-switch i { position: relative; width: 32px; height: 19px; border-radius: 999px; background: #d4d4d8; transition: background .18s ease; }
  .np-switch i::after { content: ''; position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .18s cubic-bezier(.22,1,.36,1); }
  .np-switch input:checked + i { background: var(--coral); }
  .np-switch input:checked + i::after { transform: translateX(13px); }
  .np-switch input:focus-visible + i { box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
  .np-chip:focus-visible, .np-seg button:focus-visible, .np-ic:focus-visible, .np-btn:focus-visible, .np-tool:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
  @media (max-width: 640px) { .np { width: 100%; max-height: calc(100dvh - 148px - env(safe-area-inset-bottom, 0px)); border-radius: 20px; } }
  @media (prefers-reduced-motion: reduce) { .np { animation: none; } }
`

type Row = { kind: 'one'; n: N } | { kind: 'stack'; key: string; items: N[] }

/** Notifications for one workspace: its own, plus ones that aren't tied to
 *  any (board notifications). Without a workspace (the root domain), all. */
export function inWorkspace<Q extends { or: (f: string) => Q }>(q: Q, companyId: string | null | undefined): Q {
  return companyId && /^[0-9a-f-]{36}$/i.test(companyId) ? q.or(`company_id.eq.${companyId},company_id.is.null`) : q
}

export default function NotificationsPanel({ userId, companyId = null, unreadCount, onUnread, onOpen, onClose, settingsHref }: {
  userId: string
  /** The workspace being viewed: only its notifications are listed. */
  companyId?: string | null
  /** Where "Notification settings" goes (staff only; none on the public board). */
  settingsHref?: string | null
  unreadCount: number
  /** A change to the bell badge: a delta, or 'zero' after "mark all read". */
  onUnread: (delta: number | 'zero') => void
  /** Go to what a notification is about (it has already been marked read). */
  onOpen: (n: N) => void
  onClose: () => void
}) {
  const [items, setItems] = useState<N[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [cat, setCat] = useState<Cat | 'all'>('all')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [sound, setSound] = useState(true)
  const [perm, setPerm] = useState<string>('granted')
  const [bannerOff, setBannerOff] = useState(true)
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [view, setView] = useState<'notifications' | 'deliveries'>('notifications')
  const router = useRouter()

  // The delivery open in the Delivery sheet (a row was clicked).
  const [openDelivery, setOpenDelivery] = useState<any | null>(null)

  // Scheduled deliveries: the last week (anything still not delivered shows as
  // overdue) through the next month. Reloaded after a change in the sheet.
  const loadDeliveries = useCallback(async () => {
    if (!companyId) { setDeliveries([]); return }
    const from = dayStart(new Date(Date.now() - 7 * 864e5)).toISOString()
    const to = new Date(Date.now() + 31 * 864e5).toISOString()
    try {
      const { data } = await (supabase as any).from('calendar_events')
        .select('id, title, starts_at, time_window, address, status, conversation_id, order_id')
        .eq('company_id', companyId).eq('event_type', 'delivery')
        .gte('starts_at', from).lte('starts_at', to).order('starts_at', { ascending: true }).limit(150)
      setDeliveries(data || [])
    } catch { /* the list stays as it was */ }
  }, [companyId])
  useEffect(() => { loadDeliveries() }, [loadDeliveries])
  const deliveryList = useMemo(() => deliveryGroups(deliveries), [deliveries])
  const deliveryCount = deliveryList.reduce((n, g) => n + g.rows.length, 0)
  const dueToday = deliveryList.filter(g => g.label === 'Overdue' || g.label === 'Today').reduce((n, g) => n + g.rows.length, 0)
  const goToChat = (r: any) => {
    setOpenDelivery(null)
    onClose()
    router.push(`/admin/inbox?conversation=${r.conversation_id}`)
  }

  useEffect(() => {
    setSound(notificationSoundOn())
    try { if (typeof Notification !== 'undefined') setPerm(Notification.permission) } catch {}
    try { setBannerOff(localStorage.getItem(BANNER_KEY) === '1') } catch { setBannerOff(false) }
  }, [])

  const load = useCallback(async (from = 0) => {
    const { data } = await inWorkspace((supabase as any).from('notifications').select('*').eq('user_id', userId), companyId)
      .order('created_at', { ascending: false }).range(from, from + PAGE - 1)
    const rows: N[] = data || []
    setItems(prev => from === 0 ? rows : [...prev, ...rows.filter(r => !prev.some(p => p.id === r.id))])
    setMore(rows.length === PAGE)
  }, [userId, companyId])
  useEffect(() => { setLoading(true); load(0).finally(() => setLoading(false)) }, [load])

  // New ones arrive live while the panel is open (the header relays them).
  useEffect(() => {
    const onNew = (e: any) => { const n = e.detail; if (companyId && n?.company_id && n.company_id !== companyId) return; if (n?.id) setItems(prev => prev.some(p => p.id === n.id) ? prev : [n, ...prev]) }
    window.addEventListener('colvy:notification', onNew)
    return () => window.removeEventListener('colvy:notification', onNew)
  }, [companyId])

  const setRead = async (n: N, read: boolean) => {
    if (!!n.is_read === read) return
    setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: read } : x))
    onUnread(read ? -1 : 1)
    try { await (supabase as any).from('notifications').update({ is_read: read }).eq('id', n.id) } catch {}
  }
  const setManyRead = async (list: N[]) => {
    const ids = list.filter(n => !n.is_read).map(n => n.id); if (!ids.length) return
    setItems(prev => prev.map(x => ids.includes(x.id) ? { ...x, is_read: true } : x))
    onUnread(-ids.length)
    try { await (supabase as any).from('notifications').update({ is_read: true }).in('id', ids) } catch {}
  }
  const markAll = async () => {
    setItems(prev => prev.map(x => ({ ...x, is_read: true })))
    onUnread('zero')
    try { await inWorkspace((supabase as any).from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false), companyId) } catch {}
  }
  const openOne = async (n: N) => { if (!n.is_read) await setRead(n, true); onOpen({ ...n, is_read: true }) }

  // Which categories are here, and how many unread in each.
  const catCounts = useMemo(() => {
    const m = new Map<Cat, { all: number; unread: number }>()
    for (const n of items) { const c = kindOf(n).cat; const v = m.get(c) || { all: 0, unread: 0 }; v.all++; if (!n.is_read) v.unread++; m.set(c, v) }
    return m
  }, [items])

  const shown = items.filter(n => (tab === 'all' || !n.is_read) && (cat === 'all' || kindOf(n).cat === cat))

  // Day groups, each with runs of three or more of the same thing stacked.
  const groups = useMemo(() => {
    const out: { label: string; rows: Row[] }[] = []
    for (const n of shown) {
      const label = dayLabel(n.created_at)
      let g = out[out.length - 1]
      if (!g || g.label !== label) { g = { label, rows: [] }; out.push(g) }
      const key = `${n.type}|${titleOf(n)}`
      const last = g.rows[g.rows.length - 1]
      const lastKey = last ? (last.kind === 'one' ? `${last.n.type}|${titleOf(last.n)}` : last.key.split('#')[0]) : ''
      if (last && lastKey === key && !n.conversation_id && (last.kind === 'stack' || !last.n.conversation_id)) {
        if (last.kind === 'one') g.rows[g.rows.length - 1] = { kind: 'stack', key: `${key}#${last.n.id}`, items: [last.n, n] }
        else last.items.push(n)
      } else g.rows.push({ kind: 'one', n })
    }
    // Only real runs stay stacked; two in a row read better on their own.
    for (const g of out) g.rows = g.rows.flatMap(r => r.kind === 'stack' && r.items.length < 3 ? r.items.map(n => ({ kind: 'one' as const, n })) : [r])
    return out
  }, [shown])

  const item = (n: N, child = false) => {
    const k = kindOf(n)
    const title = titleOf(n)
    const detail = detailOf(n, title)
    const amt = amountOf(n)
    return (
      <div key={n.id} role="button" tabIndex={0} className={`np-item${n.is_read ? '' : ' unread'}`}
        onClick={() => openOne(n)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openOne(n) } }}>
        {!child && <span className="np-tile" style={{ ['--k' as any]: k.color }}><Ico name={k.icon} size={18} /></span>}
        <div className="np-body">
          <div className="np-top">
            <span className="np-title">{child ? (detail || title) : title}</span>
            <span className="np-time" title={new Date(n.created_at).toLocaleString('en-AU')}>{ago(n.created_at)}</span>
          </div>
          {!child && detail && <div className="np-detail">{detail}</div>}
          {(() => {
            const who = n.actor_name && !child && !k.channel && !detail.includes(n.actor_name) && title !== n.actor_name
            if (amt == null && !who && !(k.channel && !child)) return null
            return (
              <div className="np-meta">
                {amt != null && <span className="np-amt">{money(amt)}</span>}
                {k.channel && !child && <span className="np-chan" style={{ ['--k' as any]: k.color }}>{k.channel}</span>}
                {who && <span className="np-actor">{n.actor_name}</span>}
              </div>
            )
          })()}
        </div>
        {!n.is_read && <span className="np-dot" aria-label="Unread" />}
        <div className="np-tools">
          <button type="button" className="np-tool" title={n.is_read ? 'Mark as unread' : 'Mark as read'} aria-label={n.is_read ? 'Mark as unread' : 'Mark as read'}
            onClick={e => { e.stopPropagation(); setRead(n, !n.is_read) }}>
            {n.is_read
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="12" r="5" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
          </button>
        </div>
      </div>
    )
  }

  const stack = (r: Extract<Row, { kind: 'stack' }>) => {
    const first = r.items[0]
    const k = kindOf(first)
    const title = titleOf(first)
    const unread = r.items.filter(n => !n.is_read).length
    const total = r.items.reduce((s, n) => s + (amountOf(n) || 0), 0)
    const isOpen = open.has(r.key)
    const plural = /s$/.test(title) ? title : `${title.replace(/^New /, 'new ')}s`
    return (
      <div key={r.key}>
        <div role="button" tabIndex={0} className={`np-item${unread ? ' unread' : ''}`} aria-expanded={isOpen}
          onClick={() => setOpen(s => { const x = new Set(s); x.has(r.key) ? x.delete(r.key) : x.add(r.key); return x })}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(s => { const x = new Set(s); x.has(r.key) ? x.delete(r.key) : x.add(r.key); return x }) } }}>
          <span className="np-tile" style={{ ['--k' as any]: k.color }}><Ico name={k.icon} size={18} /><span className="np-stackn">{r.items.length}</span></span>
          <div className="np-body">
            <div className="np-top">
              <span className="np-title">{r.items.length} {plural.charAt(0).toLowerCase() + plural.slice(1)}</span>
              <span className="np-time">{ago(first.created_at)}</span>
            </div>
            <div className="np-detail">Latest: {detailOf(first, title) || title}</div>
            <div className="np-meta">
              {total > 0 && <span className="np-amt">{money(total)} total</span>}
              <span className="np-actor">{isOpen ? 'Hide' : 'Show all'}</span>
            </div>
          </div>
          {unread > 0 && <span className="np-dot" aria-label={`${unread} unread`} />}
          {unread > 0 && (
            <div className="np-tools">
              <button type="button" className="np-tool" title="Mark these as read" aria-label="Mark these as read" onClick={e => { e.stopPropagation(); setManyRead(r.items) }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
            </div>
          )}
        </div>
        {isOpen && <div className="np-kids">{r.items.map(n => item(n, true))}</div>}
      </div>
    )
  }

  const presentCats = CATS.filter(c => catCounts.has(c.key))
  const emptyTitle = tab === 'unread' ? 'You’re all caught up' : cat !== 'all' ? `No ${CATS.find(c => c.key === cat)?.label.toLowerCase()} notifications` : 'No notifications yet'
  const emptyLine = tab === 'unread' ? 'New orders, messages and mentions show up here.' : 'When something happens in your workspace, it shows up here.'

  return (
    <div className="np" role="dialog" aria-label="Notifications">
      <style>{CSS}</style>
      <div className="np-head">
        <h3>Notifications {unreadCount > 0 && <span className="np-n">{unreadCount > 99 ? '99+' : unreadCount}</span>}</h3>
        <button type="button" className="np-ic" onClick={markAll} disabled={!items.some(n => !n.is_read) && unreadCount === 0} title="Mark all as read" aria-label="Mark all as read">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 12 7 17 17 7" /><polyline points="12 16 13 17 22 8" /></svg>
        </button>
        {settingsHref && <a className="np-ic" href={settingsHref} onClick={onClose} title="Notification settings" aria-label="Notification settings"><Ico name="gear" size={17} /></a>}
        <button type="button" className="np-ic" onClick={onClose} title="Close" aria-label="Close notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>
      <div className="np-bar">
        <div className="np-seg" role="tablist" aria-label="Show">
          <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>All</button>
          <button type="button" role="tab" aria-selected={tab === 'unread'} className={tab === 'unread' ? 'on' : ''} onClick={() => setTab('unread')}>
            Unread {unreadCount > 0 && <span className="c">{unreadCount > 99 ? '99+' : unreadCount}</span>}
          </button>
        </div>
        {(presentCats.length > 1 || deliveryCount > 0) && (
          <div className="np-chips" aria-label="What it’s about">
            <button type="button" className={`np-chip${view === 'notifications' && cat === 'all' ? ' on' : ''}`} onClick={() => { setView('notifications'); setCat('all') }}>Everything</button>
            {deliveryCount > 0 && (
              <button type="button" className={`np-chip np-chip-dlv${view === 'deliveries' ? ' on' : ''}`} aria-pressed={view === 'deliveries'} onClick={() => setView(view === 'deliveries' ? 'notifications' : 'deliveries')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
                Deliveries{dueToday > 0 && <span className="n">{dueToday}</span>}
              </button>
            )}
            {presentCats.length > 1 && presentCats.map(c => (
              <button key={c.key} type="button" className={`np-chip${view === 'notifications' && cat === c.key ? ' on' : ''}`} onClick={() => { setView('notifications'); setCat(view === 'notifications' && cat === c.key ? 'all' : c.key) }}>
                {c.label}{(catCounts.get(c.key)?.unread || 0) > 0 && <span className="d" aria-label="has unread" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {perm !== 'granted' && !bannerOff && (
        <div className="np-banner">
          <span className="np-tile" style={{ ['--k' as any]: 'var(--coral)', width: 32, height: 32, borderRadius: 11 }}><Ico name="bell" size={15} /></span>
          <span style={{ flex: 1 }}>{perm === 'denied' ? 'Desktop alerts are blocked. Allow them for this site in your browser’s settings.' : 'Get a desktop alert for new orders and messages.'}</span>
          {perm === 'default' && (
            <button type="button" className="np-btn primary" style={{ height: 30 }} onClick={async () => { try { setPerm(await Notification.requestPermission()) } catch {} }}>Turn on</button>
          )}
          <button type="button" className="np-ic" title="Hide" aria-label="Hide this tip" onClick={() => { setBannerOff(true); try { localStorage.setItem(BANNER_KEY, '1') } catch {} }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      <div className="np-list">
        {view === 'deliveries' ? (
          <>
            {deliveryList.map(g => (
              <div key={g.label}>
                <div className={`np-day${g.label === 'Overdue' ? ' late' : ''}`}>{g.label}</div>
                {g.rows.map(r => {
                  const done = DLV_DONE.test(String(r.status || ''))
                  return (
                    <div key={r.id} role="button" tabIndex={0} className={`np-item np-dlv${done ? ' done' : ''}`}
                      onClick={() => setOpenDelivery(r)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenDelivery(r) } }}>
                      <span className="np-tile" style={{ ['--k' as any]: g.label === 'Overdue' ? '#dc2626' : '#059669' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
                      </span>
                      <div className="np-body">
                        <div className="np-top">
                          <span className="np-title">{deliveryWho(r)}</span>
                          {r.time_window && <span className="np-time">{r.time_window}</span>}
                        </div>
                        {r.address && <div className="np-detail">{r.address}</div>}
                        <div className="np-meta">
                          <span className={`np-dlv-st s-${String(r.status || 'scheduled')}`}>{DLV_STATUS[String(r.status || 'scheduled')] || r.status}</span>
                          {g.label === 'Overdue' && <span className="np-actor">{new Date(r.starts_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>}

                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div className="np-more">
              <button type="button" className="np-btn" onClick={() => { onClose(); router.push('/admin/calendar') }}>Open the calendar</button>
            </div>
          </>
        ) : loading ? (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 13.5, color: '#8e8e93' }}>Loading…</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: '18px 0 10px' }}>
            <EmptyScroll compact kinds={['chat', 'order', 'task']} title={emptyTitle} line={emptyLine}
              action={tab === 'unread' && items.length > 0 ? <button type="button" className="np-btn" onClick={() => setTab('all')}>Show all</button> : undefined} />
          </div>
        ) : (
          <>
            {groups.map(g => (
              <div key={g.label}>
                <div className="np-day">{g.label}</div>
                {g.rows.map(r => r.kind === 'one' ? item(r.n) : stack(r))}
              </div>
            ))}
            {more && (
              <div className="np-more">
                <button type="button" className="np-btn" disabled={loadingMore} onClick={async () => { setLoadingMore(true); await load(items.length); setLoadingMore(false) }}>
                  {loadingMore ? 'Loading…' : 'Show older'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* A delivery row opens the Delivery sheet over the page; the bell stays open behind it. */}
      {openDelivery && companyId && typeof document !== 'undefined' && createPortal(
        <DeliveryDetailsSheet
          companyId={companyId}
          eventId={openDelivery.id}
          onClose={() => setOpenDelivery(null)}
          onOpenChat={openDelivery.conversation_id ? () => goToChat(openDelivery) : undefined}
          onChanged={() => { loadDeliveries() }}
        />,
        document.body,
      )}

      <div className="np-foot">
        <label className="np-switch" title="A soft chime when something new arrives">
          <input type="checkbox" checked={sound} onChange={e => { setSound(e.target.checked); try { localStorage.setItem(SOUND_KEY, e.target.checked ? '1' : '0') } catch {} }} />
          <i />
          Sound
        </label>
        {settingsHref && <a className="np-btn" href={settingsHref} onClick={onClose} style={{ height: 32 }}>Notification settings</a>}
      </div>
    </div>
  )
}
