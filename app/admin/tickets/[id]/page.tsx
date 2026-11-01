'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAiDraft, AiDraftButton, AiDraftInfo } from '@/components/AiDraft'
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ClockIcon, ExternalLinkIcon, LockIcon, MailIcon, PaperclipIcon } from '@/components/Icons'
import { computeSla, clockLabel, CLOCK_COLORS, resolveSla, DEFAULT_SLA, type SlaSettings, type Clock } from '@/lib/ticket-sla'
import { SelectPopover, MenuAvatar } from '@/components/ui/SelectMenu'

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
// A steady colour per teammate, for their initial.
const AV_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444']
const avColor = (name: string) => AV_COLORS[[...String(name || '?')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % AV_COLORS.length]
const when = (d: string | null | undefined, withYear = false) => d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit' }) : ''
const Chev = () => <svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>

// Sellio look: soft ringed cards, display-type headings, avatars on every
// message, pill status tiles and menus, a pill Reply / Internal note switch.
// One column (<=900px): a compact actions card up top (status, priority,
// assignee, deadlines) replaces the sidebar's status/priority/assignee
// controls, which would otherwise sit below the whole thread.
// Phones (<=767px) also read thread first, like the inbox: the reply box folds
// to a one-line bar pinned above the bottom nav and opens into the full
// composer when tapped (the draft is kept while folded).
const DETAIL_CSS = `
  .tkd-page { padding: 24px; --tkd-fill: #f4f4f5; --tkd-ring: #ececef; --tkd-soft: #71717a; }
  [data-theme="dark"] .tkd-page { --tkd-fill: #2a2a2e; --tkd-ring: #2e2e33; --tkd-soft: #a1a1aa; }
  .tkd-phone { display: none; }
  .tkd-cmp-bar, .tkd-cmp-collapse { display: none; }
  .tkd-display { font-family: var(--font-display), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

  /* Header: round back button, the number and date, the subject big. */
  .tkd-head { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; min-width: 0; }
  .tkd-back { width: 42px; height: 42px; flex-shrink: 0; border-radius: 50%; border: none; background: var(--card, #fff); box-shadow: 0 0 0 1px var(--tkd-ring), 0 1px 2px rgba(16,24,40,.05); color: var(--ink); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
  .tkd-back:hover { background: var(--tkd-fill); }
  .tkd-head-t { flex: 1; min-width: 0; }
  .tkd-eyebrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--tkd-soft); }
  .tkd-num { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
  .tkd-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 3px; min-width: 0; }
  .tkd-title h1 { margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -.025em; line-height: 1.15; color: var(--ink); overflow-wrap: anywhere; min-width: 0; }
  .tkd-status { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 13px; border-radius: 999px; background: var(--bg); color: var(--c); font-size: 13px; font-weight: 700; white-space: nowrap; text-transform: capitalize; }
  .tkd-status i, .tkd-st i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }

  .ticket-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
  .tkd-main, .tkd-aside { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

  .tkd-card { background: var(--card, #fff); border-radius: 22px; padding: 18px; box-shadow: 0 0 0 1px var(--tkd-ring), 0 1px 2px rgba(16,24,40,.04); min-width: 0; }
  .tkd-h { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 16px; font-weight: 750; letter-spacing: -.015em; color: var(--ink); }
  .tkd-h svg { color: var(--tkd-soft); }

  /* The thread */
  .tkd-msg-h { display: flex; align-items: flex-start; gap: 11px; min-width: 0; }
  .tkd-av { width: 40px; height: 40px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; background: var(--peach); color: var(--coral); }
  .tkd-av.agent { color: #fff; }
  .tkd-av.note { background: #fef3c7; color: #b45309; }
  .tkd-who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; padding-top: 1px; }
  .tkd-who-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
  .tkd-who b { font-size: 14.5px; font-weight: 700; color: var(--ink); }
  .tkd-who small { font-size: 12.5px; color: var(--tkd-soft); overflow-wrap: anywhere; }
  .tkd-when { font-size: 12.5px; color: var(--tkd-soft); white-space: nowrap; padding-top: 2px; }
  .tkd-body { margin: 10px 0 0 51px; font-size: 14.5px; line-height: 1.6; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
  .tkd-out { margin-left: 40px; }
  .tkd-card.note { background: #fffbeb; box-shadow: 0 0 0 1px #fde68a; }
  [data-theme="dark"] .tkd-card.note { background: color-mix(in srgb, #f59e0b 9%, var(--card, #1c1c1f)); box-shadow: 0 0 0 1px color-mix(in srgb, #f59e0b 35%, transparent); }
  .tkd-badge { display: inline-flex; align-items: center; gap: 4px; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
  .tkd-badge.ok { background: #dcfce7; color: #047857; }
  .tkd-badge.warn { background: #fef2f2; color: #dc2626; }
  .tkd-badge.in { background: #dbeafe; color: #1d4ed8; }
  .tkd-badge.note { background: #fef3c7; color: #b45309; }
  [data-theme="dark"] .tkd-badge { background: color-mix(in srgb, currentColor 16%, transparent); }
  .tkd-atts { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0 51px; }
  .tkd-att-img img { width: 120px; height: 120px; object-fit: cover; border-radius: 14px; display: block; box-shadow: 0 0 0 1px var(--tkd-ring); }
  .tkd-att-file { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px; border-radius: 999px; background: var(--tkd-fill); color: var(--ink); font-size: 13px; font-weight: 600; text-decoration: none; max-width: 100%; box-sizing: border-box; }
  .tkd-att-file span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

  /* The reply box */
  .tkd-cmp-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; min-width: 0; }
  .tkd-switch { display: inline-flex; padding: 4px; gap: 2px; border-radius: 999px; background: var(--tkd-fill); flex-shrink: 0; }
  .tkd-switch button { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: none; border-radius: 999px; background: none; color: var(--tkd-soft); font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; white-space: nowrap; }
  .tkd-switch button[aria-selected="true"] { background: var(--card, #fff); color: var(--ink); box-shadow: 0 1px 3px rgba(16,24,40,.12); }
  .tkd-switch button.note[aria-selected="true"] { color: #b45309; }
  .tkd-cmp-to { flex: 1; min-width: 0; font-size: 12.5px; color: var(--tkd-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tkd-page .tkd-ta { display: block; width: 100%; min-height: 112px; padding: 14px 16px; border: none; border-radius: 16px; background: var(--tkd-fill); color: var(--ink); font: inherit; font-size: 14.5px; line-height: 1.55; resize: vertical; outline: none; box-sizing: border-box; box-shadow: none; }
  .tkd-page .tkd-ta:focus { box-shadow: 0 0 0 2px color-mix(in srgb, var(--coral) 45%, transparent); }
  .tkd-page .tkd-ta.note { background: #fffbeb; }
  .tkd-page .tkd-ta.note:focus { box-shadow: 0 0 0 2px #fcd34d; }
  [data-theme="dark"] .tkd-page .tkd-ta.note { background: color-mix(in srgb, #f59e0b 9%, var(--tkd-fill)); }
  .tkd-cmp-msg { margin: 10px 0 0; font-size: 13px; color: var(--tkd-soft); }
  .tkd-cmp-foot { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 12px; }
  .tkd-send { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 42px; padding: 0 20px; border: none; border-radius: 999px; background: var(--coral); color: #fff; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(16,24,40,.12); white-space: nowrap; }
  .tkd-send.note { background: #b45309; }
  .tkd-send:disabled { opacity: .5; cursor: default; }
  .tkd-bar-reply { flex: 1; min-width: 0; height: 44px; display: flex; align-items: center; gap: 9px; padding: 0 16px; border: none; border-radius: 999px; background: var(--tkd-fill); font: inherit; font-size: 14.5px; color: var(--tkd-soft); cursor: text; text-align: left; }
  .tkd-bar-reply.has { color: var(--ink); }
  .tkd-bar-reply span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tkd-bar-note { height: 44px; display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; border: none; border-radius: 999px; background: #fef3c7; color: #b45309; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; flex-shrink: 0; }
  .tkd-round { width: 34px; height: 34px; margin-left: auto; align-items: center; justify-content: center; border: none; border-radius: 50%; background: var(--tkd-fill); color: var(--tkd-soft); cursor: pointer; padding: 0; flex-shrink: 0; }

  /* Side cards */
  .tkd-st-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .tkd-st { --c: var(--ink); --bg: var(--tkd-fill); display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 42px; min-width: 0; padding: 0 10px; border: none; border-radius: 999px; background: var(--tkd-fill); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; text-transform: capitalize; white-space: nowrap; -webkit-tap-highlight-color: transparent; }
  .tkd-st i { background: var(--c); }
  .tkd-st:hover { filter: brightness(.97); }
  .tkd-st[aria-pressed="true"] { background: var(--bg); color: var(--c); box-shadow: inset 0 0 0 1.5px var(--c); }
  [data-theme="dark"] .tkd-st[aria-pressed="true"], [data-theme="dark"] .tkd-status { background: color-mix(in srgb, var(--c) 18%, transparent); }
  .tkd-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; font-size: 13.5px; min-width: 0; }
  .tkd-row + .tkd-row { border-top: 1px solid var(--tkd-ring); }
  .tkd-row > span:first-child { color: var(--tkd-soft); flex-shrink: 0; }
  .tkd-row > b { font-weight: 650; color: var(--ink); text-align: right; min-width: 0; overflow-wrap: anywhere; }
  .tkd-dl { padding: 10px 0; }
  .tkd-dl + .tkd-dl { border-top: 1px solid var(--tkd-ring); }
  .tkd-dl-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13.5px; }
  .tkd-dl-top > span:first-child { color: var(--tkd-soft); }
  .tkd-dl-sub { margin-top: 4px; font-size: 12px; color: var(--tkd-soft); text-align: right; }
  .tkd-chip { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .tkd-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; color: var(--tkd-soft); }
  .tkd-pick { display: inline-flex; align-items: center; gap: 8px; height: 36px; max-width: 200px; min-width: 0; padding: 0 12px; border: none; border-radius: 999px; background: var(--tkd-fill); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; }
  .tkd-pick > span:not(.tkd-mini-av) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .tkd-pick > i { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .tkd-pick .chev { color: var(--tkd-soft); flex-shrink: 0; }
  .tkd-pick:hover { filter: brightness(.97); }
  .tkd-pick.wide { width: 100%; max-width: none; height: 44px; }
  .tkd-pick.wide .chev { margin-left: auto; }
  .tkd-mini-av { width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 11px; font-weight: 700; }
  .tkd-mini-av.none { background: none; color: var(--tkd-soft); box-shadow: inset 0 0 0 1.5px currentColor; }
  .tkd-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12.5px; font-weight: 650; color: var(--tkd-soft); }
  .tkd-cust { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .tkd-cust > div { min-width: 0; }
  .tkd-cust b { display: block; font-size: 15px; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tkd-cust small { display: block; margin-top: 2px; font-size: 13px; color: var(--tkd-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tkd-btns { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
  .tkd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 42px; border: none; border-radius: 999px; background: var(--tkd-fill); color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 650; cursor: pointer; text-decoration: none; }
  .tkd-btn:hover { filter: brightness(.97); }
  .tkd-btn.accent { color: var(--coral); }
  .tkd-art { display: flex; align-items: center; gap: 10px; padding: 10px 0; font-size: 13.5px; font-weight: 600; color: var(--ink); text-decoration: none; }
  .tkd-art + .tkd-art { border-top: 1px solid var(--tkd-ring); }
  .tkd-art span { flex: 1; min-width: 0; }
  .tkd-art svg { color: var(--tkd-soft); flex-shrink: 0; }
  .tkd-art:hover { color: var(--coral); }
  .tkd-err { margin: 12px 0 0; padding: 9px 12px; border-radius: 14px; background: #fef2f2; color: #b91c1c; font-size: 13px; font-weight: 600; line-height: 1.4; }

  @media (max-width: 900px) {
    .ticket-grid { grid-template-columns: 1fr !important; }
    .tkd-desk { display: none !important; }
    .tkd-phone { display: block; }
  }
  @media (max-width: 767px) {
    .tkd-page { padding: 12px 16px 16px; }
    .tkd-head { margin-bottom: 14px; gap: 10px; }
    .tkd-back { width: 38px; height: 38px; }
    .tkd-title h1 { font-size: 22px; }
    .tkd-status { height: 26px; padding: 0 10px; font-size: 12px; }
    .ticket-grid { gap: 12px !important; }
    .tkd-main, .tkd-aside { gap: 12px; }
    .tkd-card { padding: 14px; border-radius: 18px; }
    .tkd-out { margin-left: 18px; }
    .tkd-body, .tkd-atts { margin-left: 0; }

    /* The reply box: folded to a bar above the bottom nav; opens in place. */
    .tkd-cmp { position: fixed; left: 0; right: 0; bottom: calc(58px + env(safe-area-inset-bottom, 0px)); z-index: 880; padding: 10px 16px !important; border-radius: 20px 20px 0 0 !important; box-shadow: 0 -1px 0 var(--tkd-ring), 0 -10px 30px -16px rgba(16,24,40,.25) !important; }
    .tkd-cmp.folded .tkd-cmp-body { display: none; }
    .tkd-cmp.folded .tkd-cmp-bar { display: flex; align-items: center; gap: 8px; }
    .tkd-cmp.open { max-height: 55vh; overflow-y: auto; overscroll-behavior: contain; }
    .tkd-cmp-collapse { display: flex; }
    .tkd-cmp-to { display: none; }
    /* 16px, so iOS doesn't zoom the page when the reply or the AI "Adjust it" box is focused. */
    .tkd-cmp textarea, .tkd-cmp input { font-size: 16px !important; }
    /* Out of the way while the menu drawer, a modal or a sheet is open (as
       OverlayWatch does for the bottom nav and the orb), so it never sits over
       the drawer's links. The draft is kept. */
    html[data-colvy-overlay] .tkd-cmp { display: none !important; }
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
  // A failed status / priority / assignee change. Shown beside those controls
  // (not in the reply box, which is folded away on phones) and cleared shortly.
  const [patchErr, setPatchErr] = useState('')
  const patchErrTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // The Priority / Assignee menus (the sidebar's, or the phone card's).
  const [picker, setPicker] = useState<null | 'prio' | 'asg' | 'prio-ph' | 'asg-ph'>(null)
  const prioRef = useRef<HTMLButtonElement>(null)
  const asgRef = useRef<HTMLButtonElement>(null)
  const prioPhRef = useRef<HTMLButtonElement>(null)
  const asgPhRef = useRef<HTMLButtonElement>(null)
  useEffect(() => () => { if (patchErrTimer.current) clearTimeout(patchErrTimer.current) }, [])
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

  // The ticket, then everything around it at once (they used to load one after
  // another). Whatever happens, the page stops saying "Loading…": a failed or
  // slow extra only leaves its own bit empty.
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('support_tickets').select('*').eq('id', ticketId).maybeSingle()
        if (!live) return
        setTicket(data)
        await Promise.all([
          data?.contact_id ? (async () => { try { const { data: c } = await (supabase as any).from('contacts').select('*').eq('id', data.contact_id).maybeSingle(); if (live) setContact(c) } catch {} })() : null,
          data?.company_id ? (async () => { try { const { data: co } = await (supabase as any).from('companies').select('id,name,slug,accent_color').eq('id', data.company_id).maybeSingle(); if (live) setCompany(co) } catch {} })() : null,
          data?.company_id ? (async () => {
            try {
              const r = await authFetch(`/api/tickets/settings?companyId=${data.company_id}`, { headers: await authed() })
              if (r.ok && live) { const d = await r.json(); setSla(resolveSla(d.sla)); setTeam(d.team || []) }
            } catch {}
          })() : null,
          data?.company_id ? (async () => { try { const { data: arts } = await (supabase as any).from('help_articles').select('id,title,slug').eq('company_id', data.company_id).eq('status', 'published').limit(4); if (live) setArticles(arts || []) } catch {} })() : null,
          loadThread(),
        ])
      } catch { /* shows "Ticket not found" */ } finally {
        if (live) setLoading(false)
      }
    })()
    return () => { live = false }
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
    if (patchErrTimer.current) clearTimeout(patchErrTimer.current)
    setPatchErr('')
    try {
      const res = await authFetch(`/api/tickets/${ticketId}`, { method: 'PATCH', headers: await authed(), body: JSON.stringify(patch) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not update the ticket.')
      if (d.ticket) setTicket(d.ticket)
    } catch (e: any) {
      setTicket(prev)
      setPatchErr(e?.message || 'Could not update the ticket.')
      patchErrTimer.current = setTimeout(() => setPatchErr(''), 8000)
    }
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

  if (loading) return (
    <div className="tkd-page" aria-busy="true" aria-label="Loading the ticket">
      <style>{`.tkd-skel{border-radius:18px;background:linear-gradient(90deg,var(--card,#fff) 25%,color-mix(in srgb,var(--card,#fff) 88%,var(--slate)) 50%,var(--card,#fff) 75%);background-size:200% 100%;animation:tkdShim 1.2s ease-in-out infinite;box-shadow:0 0 0 1px var(--border)}@keyframes tkdShim{from{background-position:200% 0}to{background-position:-200% 0}}@media (prefers-reduced-motion:reduce){.tkd-skel{animation:none}}`}</style>
      <div className="tkd-skel" style={{ width: 'min(420px, 70%)', height: 34, marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: 20 }} className="ticket-grid">
        <div style={{ display: 'grid', gap: 16 }}><div className="tkd-skel" style={{ height: 180 }} /><div className="tkd-skel" style={{ height: 140 }} /></div>
        <div className="tkd-skel tkd-desk" style={{ height: 300 }} />
      </div>
      <style>{DETAIL_CSS}</style>
    </div>
  )
  if (!ticket) return <div style={{ padding: 40, color: 'var(--slate)' }}>Ticket not found.</div>

  const from = parseFrom(ticket.description || '')
  const custName = contact?.name || from?.name || ticket.name || 'Customer'
  const custEmail = contact?.email || from?.email || ticket.email || ''
  const sc = STATUS_COLORS[ticket.status] || STATUS_COLORS.open
  const pr = ticket.priority || 'normal'
  const supportAddr = company?.support_email || `support@${company?.slug || 'company'}.com`
  void tick
  const slaNow = sla.enabled ? computeSla(ticket, sla) : null

  const prioLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1)
  const prioOptions = ['urgent', 'high', 'normal', 'low'].map(p => ({ value: p, label: prioLabel(p), dot: PRIORITY_COLORS[p] }))
  const asgName = ticket.assigned_to ? (team.find(m => m.userId === ticket.assigned_to)?.name || 'Teammate') : ''
  const asgOptions = [
    { value: '', label: 'Unassigned', icon: <span className="tkd-mini-av none" aria-hidden>?</span> },
    ...team.map(m => ({ value: m.userId, label: m.name, icon: <MenuAvatar name={m.name} color={avColor(m.name)} /> })),
    ...(ticket.assigned_to && !team.some(m => m.userId === ticket.assigned_to) ? [{ value: ticket.assigned_to, label: 'Teammate' }] : []),
  ]
  const prioPick = (ref: React.RefObject<HTMLButtonElement | null>, key: 'prio' | 'prio-ph', wide = false) => (
    <button ref={ref} type="button" className={`tkd-pick${wide ? ' wide' : ''}`} aria-haspopup="listbox" aria-expanded={picker === key} aria-label={`Priority: ${prioLabel(pr)}`}
      onClick={() => setPicker(picker === key ? null : key)}>
      <i style={{ background: PRIORITY_COLORS[pr] || '#6b7280' }} /><span>{prioLabel(pr)}</span><Chev />
    </button>
  )
  const asgPick = (ref: React.RefObject<HTMLButtonElement | null>, key: 'asg' | 'asg-ph', wide = false) => (
    <button ref={ref} type="button" className={`tkd-pick${wide ? ' wide' : ''}`} aria-haspopup="listbox" aria-expanded={picker === key} aria-label={`Assignee: ${asgName || 'Unassigned'}`}
      onClick={() => setPicker(picker === key ? null : key)}>
      {asgName ? <span className="tkd-mini-av" style={{ background: avColor(asgName) }} aria-hidden>{asgName.charAt(0).toUpperCase()}</span> : <span className="tkd-mini-av none" aria-hidden>?</span>}
      <span>{asgName || 'Unassigned'}</span><Chev />
    </button>
  )
  const statusTile = (s: string) => {
    const c = STATUS_COLORS[s]
    return (
      <button key={s} type="button" className="tkd-st" aria-pressed={ticket.status === s} onClick={() => updateStatus(s)}
        style={{ ['--c' as any]: c.c, ['--bg' as any]: c.bg }}>
        <i aria-hidden />{s.replace('_', ' ')}
      </button>
    )
  }
  const clockChip = (c: Clock, what: 'Reply' | 'Resolve') => {
    const col = CLOCK_COLORS[c.state]
    return <span className="tkd-chip" style={{ background: col.bg, color: col.c }}>{clockLabel(c, what)}</span>
  }
  const barText = draft.trim() ? draft.trim().replace(/\s+/g, ' ') : toast || `Reply to ${custName}…`
  const patchErrLine = patchErr ? <p role="alert" className="tkd-err">{patchErr}</p> : null
  const attachments = (list: any[]) => (
    <div className="tkd-atts">
      {list.map((a: any, i: number) => {
        const isImg = /^image\//.test(a.type || '') || /\.(png|jpe?g|gif|webp|avif)$/i.test(a.name || '')
        return isImg ? (
          <a key={i} className="tkd-att-img" href={a.url} target="_blank" rel="noreferrer" title={a.name}>
            <img src={a.url} alt={a.name || 'attachment'} />
          </a>
        ) : (
          <a key={i} className="tkd-att-file" href={a.url} target="_blank" rel="noreferrer" download>
            <PaperclipIcon size={14} color="var(--slate)" />
            <span>{a.name || 'attachment'}</span>
          </a>
        )
      })}
    </div>
  )

  return (
    <div className="tkd-page">
      <style>{DETAIL_CSS}</style>

      {/* Header */}
      <div className="tkd-head">
        <button type="button" className="tkd-back" onClick={() => router.push('/admin/tickets')} aria-label="All tickets" title="All tickets">
          <ChevronLeftIcon size={18} />
        </button>
        <div className="tkd-head-t">
          <div className="tkd-eyebrow">
            <span className="tkd-num">{ticket.ticket_number}</span>
            <span aria-hidden>·</span>
            <span>Created {when(ticket.created_at, true)}</span>
          </div>
          <div className="tkd-title">
            <h1 className="tkd-display">{ticket.subject || ticket.ticket_number}</h1>
            <span className="tkd-status" style={{ ['--c' as any]: sc.c, ['--bg' as any]: sc.bg }}><i aria-hidden />{String(ticket.status).replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      <div className="ticket-grid">
        {/* Main column */}
        <div className="tkd-main">
          {/* Phones: the ticket's controls in one compact card above the thread. */}
          <div className="tkd-phone tkd-card" aria-label="Ticket actions">
            <div className="tkd-st-grid" role="group" aria-label="Ticket status">
              {STATUSES.map(statusTile)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 12 }}>
              <div className="tkd-field">Priority{prioPick(prioPhRef, 'prio-ph', true)}</div>
              <div className="tkd-field">Assignee{asgPick(asgPhRef, 'asg-ph', true)}</div>
            </div>
            {slaNow && (slaNow.firstResponse.state !== 'off' || slaNow.resolution.state !== 'off') && (
              <div className="tkd-chips">
                <ClockIcon size={14} />
                {slaNow.firstResponse.state !== 'off' && clockChip(slaNow.firstResponse, 'Reply')}
                {slaNow.resolution.state !== 'off' && clockChip(slaNow.resolution, 'Resolve')}
              </div>
            )}
            {patchErrLine}
          </div>

          {/* Original message */}
          <article className="tkd-card">
            <div className="tkd-msg-h">
              <span className="tkd-av" aria-hidden>{initials(custName)}</span>
              <div className="tkd-who">
                <div className="tkd-who-top"><b>{custName}</b><span className="tkd-badge in">From customer</span></div>
                {custEmail && <small>{custEmail} · to {supportAddr}</small>}
              </div>
              <span className="tkd-when">{when(ticket.created_at)}</span>
            </div>
            <div className="tkd-body">{cleanBody(ticket.description) || '(no message)'}</div>
          </article>

          {/* Reply / note thread */}
          {messages.map(m => {
            const isNote = m.kind === 'note'
            const isInbound = m.direction === 'in'
            const who = m.author_name || (isInbound ? 'Customer' : 'Agent')
            return (
              <article key={m.id} className={`tkd-card${isNote ? ' note' : ''}${(isNote || isInbound) ? '' : ' tkd-out'}`}>
                <div className="tkd-msg-h">
                  {isNote
                    ? <span className="tkd-av note" aria-hidden><LockIcon size={15} /></span>
                    : isInbound
                      ? <span className="tkd-av" aria-hidden>{initials(who)}</span>
                      : <span className="tkd-av agent" style={{ background: avColor(who) }} aria-hidden>{initials(who)}</span>}
                  <div className="tkd-who">
                    <div className="tkd-who-top">
                      <b>{who}</b>
                      {isNote
                        ? <span className="tkd-badge note">Internal note</span>
                        : isInbound
                          ? <span className="tkd-badge in">From customer</span>
                          : m.emailed
                            ? <span className="tkd-badge ok"><CheckIcon size={11} /> Emailed to customer</span>
                            : <span className="tkd-badge warn" title="This reply was saved but not delivered — no mailbox is connected for this workspace.">Saved · not emailed</span>}
                    </div>
                  </div>
                  <span className="tkd-when">{when(m.created_at)}</span>
                </div>
                <div className="tkd-body">{m.body}</div>
                {Array.isArray(m.attachments) && m.attachments.length > 0 && attachments(m.attachments)}
              </article>
            )
          })}

          {/* Composer. On phones it's pinned above the bottom nav and folds to a bar. */}
          <div className={`tkd-card tkd-cmp ${cmpOpen ? 'open' : 'folded'}`}>
            <div className="tkd-cmp-bar">
              <button type="button" className={`tkd-bar-reply${draft.trim() || toast ? ' has' : ''}`} onClick={() => openComposer('reply')} aria-label={`Reply to ${custName}`}>
                <MailIcon size={16} color="var(--coral)" />
                <span>{barText}</span>
              </button>
              <button type="button" className="tkd-bar-note" onClick={() => openComposer('note')}>
                <LockIcon size={14} /> Note
              </button>
            </div>
            <div className="tkd-cmp-body">
              <div className="tkd-cmp-top">
                <div className="tkd-switch" role="tablist" aria-label="Reply or internal note">
                  {(['reply', 'note'] as const).map(t => (
                    <button key={t} type="button" role="tab" aria-selected={tab === t} className={t} onClick={() => setTab(t)}>
                      {t === 'reply' ? <><MailIcon size={15} /> Reply</> : <><LockIcon size={14} /> Internal note</>}
                    </button>
                  ))}
                </div>
                <span className="tkd-cmp-to">{tab === 'reply' ? (custEmail ? `Emailed to ${custEmail}` : `To ${custName}`) : 'Only your team sees this'}</span>
                <button type="button" className="tkd-cmp-collapse tkd-round" onClick={foldComposer} title="Fold the reply box" aria-label="Fold the reply box">
                  <ChevronDownIcon size={16} />
                </button>
              </div>
              {tab === 'reply' && <AiDraftInfo info={aiDraft.info} error={aiDraft.error} busy={aiDraft.busy} onRedo={i => aiDraft.run(i)} onClose={aiDraft.clear} />}
              <textarea ref={textRef} className={`tkd-ta${tab === 'note' ? ' note' : ''}`} value={draft} onChange={e => setDraft(e.target.value)} rows={4} aria-label={tab === 'reply' ? 'Reply' : 'Internal note'}
                placeholder={tab === 'reply' ? 'Write a reply — this is emailed to the customer…' : 'Add an internal note (only your team sees this)…'} />
              {toast && <p role="status" className="tkd-cmp-msg">{toast}</p>}
              <div className="tkd-cmp-foot">
                {tab === 'reply' && <AiDraftButton busy={aiDraft.busy} onClick={() => aiDraft.run()} height={42} />}
                <button type="button" className={`tkd-send tkd-cmp-send${tab === 'note' ? ' note' : ''}`} onClick={send} disabled={sending || !draft.trim()}>
                  {tab === 'reply' ? <MailIcon size={15} /> : <LockIcon size={14} />}
                  {sending ? 'Sending…' : tab === 'reply' ? 'Send reply' : 'Add note'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="tkd-aside">
          <div className="tkd-desk tkd-card">
            <h3 className="tkd-h tkd-display">Status</h3>
            <div className="tkd-st-grid" role="group" aria-label="Ticket status">
              {STATUSES.map(statusTile)}
            </div>
            {patchErrLine}
          </div>

          {slaNow && (() => {
            const t = slaNow
            const row = (label: string, c: Clock, what: 'Reply' | 'Resolve') => {
              const at = c.doneAt || c.dueAt
              return (
                <div className="tkd-dl">
                  <div className="tkd-dl-top">
                    <span>{label}</span>
                    {c.state === 'off' ? <span style={{ color: '#94a3b8' }}>—</span> : clockChip(c, what)}
                  </div>
                  {at && c.state !== 'off' && (
                    <div className="tkd-dl-sub">
                      {c.doneAt ? 'Done' : 'Due'} {at.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              )
            }
            return (
              <div className="tkd-card" style={t.worst === 'overdue' ? { boxShadow: '0 0 0 1px #fecaca, 0 1px 2px rgba(16,24,40,.04)' } : undefined}>
                <h3 className="tkd-h tkd-display"><ClockIcon size={16} /> Deadlines</h3>
                {row('First reply', t.firstResponse, 'Reply')}
                {row('Resolution', t.resolution, 'Resolve')}
              </div>
            )
          })()}

          <div className="tkd-card">
            <h3 className="tkd-h tkd-display">Details</h3>
            <div className="tkd-row"><span>Ticket ID</span><b>{ticket.ticket_number}</b></div>
            <div className="tkd-row"><span>Created</span><b>{new Date(ticket.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
            <div className="tkd-row"><span>Last updated</span><b>{new Date(ticket.updated_at || ticket.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</b></div>
            <div className="tkd-row tkd-desk"><span>Priority</span>{prioPick(prioRef, 'prio')}</div>
            <div className="tkd-row tkd-desk"><span>Assignee</span>{asgPick(asgRef, 'asg')}</div>
          </div>

          <div className="tkd-card">
            <h3 className="tkd-h tkd-display">Customer</h3>
            <div className="tkd-cust">
              <span className="tkd-av" aria-hidden>{initials(custName)}</span>
              <div>
                <b>{custName}</b>
                {custEmail && <small>{custEmail}</small>}
              </div>
            </div>
            {(contact?.id || ticket.conversation_id) && (
              <div className="tkd-btns">
                {contact?.id && <button type="button" className="tkd-btn" onClick={() => router.push(`/admin/customers/profile?id=${contact.id}`)}>View customer</button>}
                {ticket.conversation_id && <button type="button" className="tkd-btn accent" onClick={() => router.push(`/admin/inbox?conversation=${ticket.conversation_id}`)}>View conversation</button>}
              </div>
            )}
          </div>

          {articles.length > 0 && (
            <div className="tkd-card">
              <h3 className="tkd-h tkd-display">Related articles</h3>
              {articles.map(a => (
                <a key={a.id} className="tkd-art" href={company?.slug ? `https://${company.slug}.colvy.com/help/${a.id}` : `/help/${a.id}`} target="_blank" rel="noreferrer">
                  <span>{a.title}</span><ExternalLinkIcon size={13} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <SelectPopover open={picker === 'prio' || picker === 'prio-ph'} onClose={() => setPicker(null)} anchorRef={picker === 'prio-ph' ? prioPhRef : prioRef}
        label="Priority" value={pr} options={prioOptions} width={200} onPick={v => patchTicket({ priority: v })} />
      <SelectPopover open={picker === 'asg' || picker === 'asg-ph'} onClose={() => setPicker(null)} anchorRef={picker === 'asg-ph' ? asgPhRef : asgRef}
        label="Assignee" value={ticket.assigned_to || ''} options={asgOptions} width={240} onPick={v => patchTicket({ assigned_to: v || null })} />
    </div>
  )
}
