'use client'

import { enrichNames } from '@/lib/team-names'
import { loadStaffRows } from '@/lib/team-list'
import AssigneePicker from '@/components/AssigneePicker'
import CustomerPicker from '@/components/CustomerPicker'
import AttachmentUploader from '@/components/AttachmentUploader'
import TaskEditor from '@/components/TaskEditor'
import { decodeEntities as dec } from '@/lib/decode-entities'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import EmptyScroll from '@/components/EmptyScroll'

// Default event types. Colours are fixed; the label and whether a type is shown
// are per-company overrides (companies.calendar_settings.event_types), editable
// on the fly from the gear on the calendar. `task` is driven by the Tasks page,
// so it can be renamed but not hidden here.
const EVENT_TYPE_BASE: Record<string, { label: string; bg: string; fg: string; dot: string; locked?: boolean }> = {
  delivery:    { label: 'Delivery',    bg: '#fff4f1', fg: '#c2410c', dot: '#f97316' },
  appointment: { label: 'Appointment', bg: '#eef2ff', fg: '#4338ca', dot: '#6366f1' },
  booking:     { label: 'Booking',     bg: '#ecfdf5', fg: '#15803d', dot: '#22c55e' },
  task:        { label: 'Task',        bg: '#f5f3ff', fg: '#7c3aed', dot: '#8b5cf6', locked: true },
  pickup:      { label: 'Pickup',      bg: '#fefce8', fg: '#a16207', dot: '#eab308' },
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  scheduled:   { label: 'Scheduled',   color: '#6b7280' },
  confirmed:   { label: 'Confirmed',   color: '#2563eb' },
  in_progress: { label: 'On its way',  color: '#f97316' },
  completed:   { label: 'Completed',   color: '#15803d' },
  cancelled:   { label: 'Cancelled',   color: '#dc2626' },
  missed:      { label: 'Missed',      color: '#dc2626' },
}

// Only work that needs doing can be overdue; appointments in the past are just past.
const OVERDUE_TYPES = ['task', 'delivery', 'pickup']
const DELIVERY_STEPS: [string, string][] = [['confirmed', 'Confirmed'], ['in_progress', 'On its way'], ['completed', 'Delivered'], ['missed', 'Missed']]
const CHANNEL_LABEL: Record<string, string> = { in_app: 'in-app', email: 'email', sms: 'SMS' }
const VIEW_KEY = 'colvy-cal-view'

// The Monday on or before the 1st to the Sunday on or after the month's end.
const gridRange = (c: Date) => {
  const first = new Date(c.getFullYear(), c.getMonth(), 1)
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7))
  const last = new Date(c.getFullYear(), c.getMonth() + 1, 0)
  const end = new Date(last); end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7))); end.setHours(23, 59, 59, 999)
  return { start, end }
}
// All-day events first, then by time.
const sortEvents = (list: any[]) => [...list].sort((a, b) => {
  const da = new Date(a.starts_at), db = new Date(b.starts_at)
  const dayA = new Date(da.getFullYear(), da.getMonth(), da.getDate()).getTime()
  const dayB = new Date(db.getFullYear(), db.getMonth(), db.getDate()).getTime()
  if (dayA !== dayB) return dayA - dayB
  if (!!a.is_all_day !== !!b.is_all_day) return a.is_all_day ? -1 : 1
  return da.getTime() - db.getTime()
})
const groupByDay = (list: any[], keyOf: (d: Date) => string) => {
  const out: [string, Date, any[]][] = []
  for (const e of sortEvents(list)) {
    const d = new Date(e.starts_at); const k = keyOf(d)
    let g = out.find(x => x[0] === k)
    if (!g) { g = [k, new Date(d.getFullYear(), d.getMonth(), d.getDate()), []]; out.push(g) }
    g[2].push(e)
  }
  return out
}
// "9am", "2:30pm".
const shortTime = (d: Date) => d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(/\s/g, '').toLowerCase()
const relDay = (d: Date, today0: Date) => {
  const n = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today0.getTime()) / 864e5)
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : ''
}
const dayKeyDate = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m, d) }
const peopleOf = (e: any): any[] => (Array.isArray(e.assignees) && e.assignees.length) ? e.assignees : (e.assigned_to_name ? [{ name: e.assigned_to_name }] : [])
const listOf = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
const hue = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360; return h }
const initials = (n: string) => (n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
const tint = (c: string) => ({ ['--t' as any]: c }) as CSSProperties

const CAL_CSS = `
  @keyframes clIn { from { transform: translateX(28px); opacity: 0 } to { transform: none; opacity: 1 } }
  @keyframes clFade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes clRise { from { transform: translateY(12px) scale(.98); opacity: 0 } to { transform: none; opacity: 1 } }
  @keyframes clPop { from { transform: translateY(-4px); opacity: 0 } to { transform: none; opacity: 1 } }
  .cl-root { padding: 24px 28px 40px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); }
  .cl-root button::before, .cl-panel button::before, .cl-overlay button::before { display: none; }
  .cl-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .cl-head h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; color: var(--ink); }
  .cl-head p { margin: 6px 0 0; font-size: 14px; color: #71717a; }
  .cl-head-acts { display: flex; align-items: center; gap: 8px; }
  .cl-ic { position: relative; width: 38px; height: 38px; flex-shrink: 0; padding: 0; border: none; border-radius: 999px; background: #f4f4f5; color: #3f3f46; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color .15s ease, color .15s ease; }
  .cl-ic:hover { background-color: #ececef; color: #18181b; }
  .cl-ic.sm { width: 34px; height: 34px; }
  .cl-ic.danger:hover { color: #dc2626; background-color: #fef2f2; }
  .cl-badge { position: absolute; top: 8px; right: 9px; width: 8px; height: 8px; border-radius: 50%; background: var(--coral); box-shadow: 0 0 0 2px #f4f4f5; }
  .cl-ic:focus-visible, .cl-pill:focus-visible, .cl-chip:focus-visible, .cl-ctl:focus-visible, .cl-add:focus-visible, .cl-tick:focus-visible, .cl-check:focus-visible, .cl-row:focus-visible, .cl-act:focus-visible, .cl-choice:focus-visible, .cl-pick:focus-visible, .cl-switch-row:focus-visible, .cl-switch:focus-visible, .cl-mi:focus-visible, .cl-earlier:focus-visible, .cl-more:focus-visible, .cl-back:focus-visible, .seg button:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }

  .cl-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .cl-month { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .cl-month h2 { margin: 0 4px 0 6px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); white-space: nowrap; }
  .cl-pill { height: 34px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: background-color .15s ease; }
  .cl-pill:hover { background-color: #ececef; }
  .cl-pill:disabled { opacity: .45; cursor: default; background-color: #f4f4f5; }
  .cl-spacer { flex: 1; }
  .seg { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: #f4f4f5; }
  .seg button { height: 32px; padding: 0 13px; border: none; border-radius: 999px; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #52525b; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; transition: background .15s ease, color .15s ease, box-shadow .15s ease; }
  .seg button:hover { color: #18181b; }
  .seg button.on { background: #fff; color: #18181b; box-shadow: 0 1px 3px rgba(0,0,0,.1), 0 0 0 .5px rgba(0,0,0,.04); }
  .cl-search-wrap { position: relative; }
  .cl-search-wrap > svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #a1a1aa; pointer-events: none; }
  .cl-search { width: 220px; height: 38px; padding: 0 34px 0 36px; border-radius: 999px; border: 1.5px solid transparent; background: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); box-sizing: border-box; outline: none; transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease; }
  .cl-search::placeholder { color: #a1a1aa; }
  .cl-search:focus { background-color: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
  .cl-search-x { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 26px; height: 26px; padding: 0; border: none; border-radius: 999px; background: #e4e4e7; color: #52525b; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .cl-search-x:hover { background-color: #d4d4d8; color: #18181b; }
  .cl-ctl { height: 38px; max-width: 220px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; transition: background-color .15s ease; }
  .cl-ctl:hover { background-color: #ececef; }
  .cl-ctl > svg:first-child { color: #71717a; flex-shrink: 0; }
  .cl-ctl-t { overflow: hidden; text-overflow: ellipsis; }
  .cl-ctl.set { background-color: color-mix(in srgb, var(--coral) 12%, #fff); color: color-mix(in srgb, var(--coral) 85%, #000); }
  .cl-ctl.set > svg:first-child { color: currentColor; }
  .cl-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 60; min-width: 230px; max-height: 320px; overflow-y: auto; padding: 6px; background: #fff; border-radius: 16px; box-shadow: 0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05); animation: clPop .14s ease; box-sizing: border-box; }
  .cl-mi { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 9px 10px; border: none; border-radius: 10px; background: none; color: var(--ink); font: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; }
  .cl-mi:hover { background-color: #f4f4f5; }
  .cl-mi.on { font-weight: 700; }
  .cl-mi-check { margin-left: auto; display: inline-flex; color: var(--coral); }
  .cl-def { height: 20px; padding: 0 7px; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; }
  .cl-menu-foot { margin: 4px 4px 0; padding: 8px 6px 2px; border-top: 1px solid #f0f0f2; font-size: 11.5px; color: #8e8e93; }
  .cl-menu-head { margin: 4px 10px 6px; font-size: 12.5px; font-weight: 600; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }

  .cl-types { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin-bottom: 14px; padding: 1px 0 2px; }
  .cl-types::-webkit-scrollbar { display: none; }
  .cl-chip { flex-shrink: 0; height: 32px; padding: 0 12px; border-radius: 999px; border: none; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; transition: background-color .15s ease, color .15s ease; }
  .cl-chip:hover { background-color: #ececef; color: #18181b; }
  .cl-chip .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--k); flex-shrink: 0; }
  .cl-chip .n { min-width: 18px; height: 18px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #fff; color: #52525b; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .cl-chip.on { background-color: color-mix(in srgb, var(--k) 14%, #fff); color: color-mix(in srgb, var(--k) 75%, #000); }
  .cl-chip.all.on { background-color: #18181b; color: #fff; }
  .cl-chip.all.on .n { background: rgba(255,255,255,.18); color: #fff; }
  .cl-chip.warn { --k: #dc2626; background-color: #fef2f2; color: #b91c1c; }
  .cl-chip.warn:hover { background-color: #fee2e2; }

  .cl-card { background: #fff; border-radius: 20px; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04); overflow: hidden; }
  .cl-wds, .cl-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .cl-wd { padding: 11px 12px 9px; font-size: 12.5px; font-weight: 600; color: #8e8e93; border-bottom: 1px solid #f0f0f2; }
  .cl-wd .s { display: none; }
  .cl-cell { position: relative; min-height: 118px; padding: 6px 6px 8px; box-sizing: border-box; border-right: 1px solid #f0f0f2; border-bottom: 1px solid #f0f0f2; cursor: pointer; overflow: hidden; transition: background-color .12s ease; }
  .cl-cell:nth-child(7n) { border-right: none; }
  .cl-grid > .cl-cell:nth-last-child(-n+7) { border-bottom: none; }
  .cl-cell.wknd { background-color: #fcfcfd; }
  .cl-cell.out { background-color: #fafafa; }
  .cl-cell:hover { background-color: #f7f7f8; }
  .cl-cell.out .cl-num { color: #b4b4ba; }
  .cl-cell.out .cl-evs { opacity: .6; }
  .cl-cell-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .cl-num { min-width: 26px; height: 26px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: #3f3f46; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cl-cell.today .cl-num { background: var(--coral); color: #fff; font-weight: 700; }
  .cl-add { width: 24px; height: 24px; padding: 0; border: none; border-radius: 999px; background: #fff; color: #71717a; box-shadow: 0 0 0 1px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.05); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity .12s ease, color .12s ease; }
  .cl-cell:hover .cl-add, .cl-add:focus-visible { opacity: 1; }
  .cl-add:hover { color: var(--coral); }
  .cl-evs { display: flex; flex-direction: column; gap: 3px; }
  .cl-ev { display: flex; align-items: center; gap: 5px; height: 22px; padding: 0 6px 0 5px; border-radius: 7px; background-color: color-mix(in srgb, var(--k) 12%, #fff); color: var(--f); font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; cursor: pointer; transition: background-color .12s ease; }
  .cl-ev:hover { background-color: color-mix(in srgb, var(--k) 22%, #fff); }
  .cl-ev.done, .cl-ev.cancelled { opacity: .55; }
  .cl-ev.cancelled .cl-ev-title { text-decoration: line-through; }
  .cl-ev-time { flex-shrink: 0; font-weight: 500; opacity: .8; }
  .cl-ev-title { overflow: hidden; text-overflow: ellipsis; }
  .cl-ev-clip { flex-shrink: 0; margin-left: auto; display: inline-flex; align-items: center; gap: 2px; font-size: 10.5px; opacity: .8; }
  /* A dot that grows into a tick on hover: tap it to mark the event done. */
  .cl-tick { flex-shrink: 0; width: 12px; height: 12px; padding: 0; box-sizing: border-box; border-radius: 50%; border: 1.5px solid var(--k); background-color: var(--k); color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transform: scale(.55); transition: transform .12s ease, background-color .12s ease; }
  .cl-ev:hover .cl-tick { transform: none; background-color: #fff; }
  .cl-tick.on, .cl-ev:hover .cl-tick.on { transform: none; background-color: #22c55e; border-color: #22c55e; }
  .cl-more { align-self: flex-start; height: 20px; padding: 0 6px; border: none; border-radius: 6px; background: none; color: #71717a; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
  .cl-more:hover { background-color: #ececef; color: #18181b; }
  .cl-dots { display: none; }

  .cl-agenda { padding: 4px 20px 18px; }
  .cl-dh { position: sticky; top: 0; z-index: 2; display: flex; align-items: baseline; gap: 8px; padding: 16px 0 8px; background: #fff; font-size: 15px; font-weight: 700; color: var(--ink); }
  .cl-dh small { font-size: 13px; font-weight: 500; color: #8e8e93; }
  .cl-dh .n { margin-left: auto; font-size: 12.5px; font-weight: 600; color: #a1a1aa; }
  .cl-dh.today { color: var(--coral); }
  .cl-row { display: grid; grid-template-columns: 22px 62px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 10px 12px; margin: 0 -12px; border-radius: 14px; cursor: pointer; outline: none; transition: background-color .12s ease; }
  .cl-row:hover { background-color: #f7f7f8; }
  .cl-row.done .cl-row-title, .cl-row.cancelled .cl-row-title { color: #a1a1aa; text-decoration: line-through; }
  .cl-check { width: 20px; height: 20px; padding: 0; box-sizing: border-box; border-radius: 50%; border: 1.5px solid #d4d4d8; background: #fff; color: #fff; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: border-color .12s ease, background-color .12s ease; }
  .cl-check:hover { border-color: var(--k); }
  .cl-check.on { background-color: #22c55e; border-color: #22c55e; }
  .cl-when { font-size: 13px; font-weight: 600; color: #52525b; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cl-row-title { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cl-row-meta { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; margin-top: 4px; font-size: 12.5px; color: #8e8e93; }
  .cl-tag { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; background: color-mix(in srgb, var(--t) 12%, #fff); color: color-mix(in srgb, var(--t) 78%, #000); }
  .cl-tag.dot::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--t); }
  .cl-clip { display: inline-flex; align-items: center; gap: 3px; }
  .cl-faces { display: inline-flex; }
  .cl-face { width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%; box-shadow: 0 0 0 2px #fff; font-size: 10.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .cl-face + .cl-face { margin-left: -7px; }
  .cl-face.more { background: #f4f4f5; color: #52525b; }
  .cl-earlier { display: flex; align-items: center; gap: 6px; width: 100%; margin: 14px 0 2px; padding: 11px 14px; border: none; border-radius: 14px; background: #fafafa; font: inherit; font-size: 13.5px; font-weight: 600; color: #52525b; cursor: pointer; text-align: left; transition: background-color .12s ease; }
  .cl-earlier:hover { background-color: #f4f4f5; }
  .cl-earlier .od { color: #b91c1c; }
  .cl-earlier > svg { margin-left: auto; transition: transform .2s ease; }
  .cl-earlier[aria-expanded="true"] > svg { transform: rotate(180deg); }
  .cl-muted { margin: 18px 0 4px; font-size: 13.5px; color: #8e8e93; }
  .cl-results { margin: 0; padding: 16px 20px 0; font-size: 13.5px; font-weight: 500; color: #71717a; }

  .cl-note { display: flex; gap: 10px; align-items: flex-start; margin-top: 16px; padding: 12px 14px; border-radius: 16px; background: #fafafa; font-size: 13px; color: #71717a; line-height: 1.5; }
  .cl-note > svg { flex-shrink: 0; margin-top: 2px; color: #a1a1aa; }
  .cl-note b { color: #3f3f46; font-weight: 600; }

  .cl-scrim { position: fixed; inset: 0; z-index: 4000; background: rgba(15,15,20,.3); animation: clFade .2s ease; }
  .cl-panel { position: fixed; top: 8px; right: 8px; bottom: 8px; width: 440px; max-width: calc(100vw - 16px); z-index: 4001; display: flex; flex-direction: column; background: #f4f4f5; border-radius: 24px; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.05); animation: clIn .32s cubic-bezier(.22,1,.36,1); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); }
  .cl-ph { flex-shrink: 0; background: #fff; border-bottom: 1px solid #ececef; padding: 14px 18px 16px; }
  .cl-ph-top { display: flex; align-items: center; gap: 4px; margin: 0 -6px 8px 0; min-height: 34px; }
  .cl-kicker { font-size: 13px; font-weight: 700; color: var(--coral); }
  .cl-back { height: 32px; padding: 0 12px 0 8px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; }
  .cl-back:hover { background-color: #ececef; }
  .cl-ph-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
  .cl-ph-title { margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.2; color: var(--ink); overflow-wrap: anywhere; }
  .cl-ph-sub { margin: 6px 0 0; font-size: 13.5px; color: #71717a; }
  .cl-acts { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; margin: 14px -18px 0; padding: 0 18px 1px; }
  .cl-acts::-webkit-scrollbar { display: none; }
  .cl-act { flex-shrink: 0; height: 36px; display: inline-flex; align-items: center; gap: 7px; padding: 0 13px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: pointer; text-decoration: none; transition: background-color .15s ease; }
  .cl-act svg { color: #52525b; flex-shrink: 0; }
  .cl-act:hover { background-color: #ececef; }
  .cl-act.primary { background-color: var(--coral); color: #fff; }
  .cl-act.primary:hover { background-color: var(--coral); filter: brightness(.95); }
  .cl-act.done { background-color: #dcfce7; color: #15803d; }
  .cl-act.done:hover { background-color: #bbf7d0; }
  .cl-act.primary svg, .cl-act.done svg { color: currentColor; }
  .cl-pbody { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
  .cl-sect { background: #fff; border-radius: 18px; padding: 14px 16px; }
  .cl-daylist { padding: 4px 16px; }
  .cl-daylist .cl-row { grid-template-columns: 22px 56px minmax(0, 1fr) auto; }
  .cl-sect-h { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-size: 14px; font-weight: 700; color: var(--ink); }
  .cl-count { min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box; border-radius: 999px; background: #f4f4f5; color: #52525b; font-size: 11.5px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .cl-line { display: flex; align-items: flex-start; gap: 10px; padding: 5px 0; font-size: 13.5px; color: #3f3f46; line-height: 1.45; }
  .cl-line > svg { flex-shrink: 0; margin-top: 1px; color: #a1a1aa; }
  .cl-line a { color: var(--coral); font-weight: 600; text-decoration: none; }
  .cl-line a:hover { text-decoration: underline; }
  .cl-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .cl-choice { height: 36px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: background-color .15s ease, color .15s ease; }
  .cl-choice:hover { background-color: #ececef; color: #18181b; }
  .cl-choice.on { background-color: #18181b; color: #fff; }
  .cl-person { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13.5px; font-weight: 600; color: var(--ink); }
  .cl-notes { margin: 0; font-size: 13.5px; color: #3f3f46; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cl-thumbs { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 6px; }
  .cl-thumb { aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: #f4f4f5; display: flex; align-items: center; justify-content: center; color: #71717a; text-decoration: none; font-size: 11px; font-weight: 700; }
  .cl-thumb img { width: 100%; height: 100%; object-fit: cover; }

  .cl-overlay { position: fixed; inset: 0; z-index: 4100; background: rgba(15,15,20,.35); display: flex; align-items: center; justify-content: center; padding: 20px; animation: clFade .18s ease; }
  .cl-modal { width: 500px; max-width: 100%; max-height: 90dvh; overflow-y: auto; box-sizing: border-box; background: #fff; border-radius: 24px; padding: 24px 24px 0; box-shadow: 0 24px 64px rgba(0,0,0,.22); animation: clRise .24s cubic-bezier(.22,1,.36,1); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); }
  .cl-modal h2 { margin: 0 0 4px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
  .cl-lead { margin: 0 0 18px; font-size: 13.5px; color: #71717a; line-height: 1.5; }
  .cl-lbl { display: block; margin: 16px 0 8px; font-size: 14px; font-weight: 700; color: var(--ink); }
  .cl-lbl small { margin-left: 4px; font-size: 13px; font-weight: 400; color: #8e8e93; }
  .cl-field { display: block; width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px; border: 1.5px solid transparent; border-radius: 12px; background-color: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); outline: none; transition: background-color .15s ease, border-color .15s ease, box-shadow .15s ease; }
  .cl-field::placeholder { color: #a1a1aa; }
  .cl-field:focus { background-color: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
  textarea.cl-field { height: auto; min-height: 84px; padding: 11px 14px; resize: vertical; line-height: 1.45; }
  select.cl-field { appearance: none; -webkit-appearance: none; padding-right: 36px; cursor: pointer; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 13px center; background-size: 14px; }
  .cl-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .cl-wrap { display: flex; flex-wrap: wrap; gap: 6px; }
  .cl-pick { height: 34px; padding: 0 13px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background-color .15s ease, color .15s ease, box-shadow .15s ease; }
  .cl-pick:hover { background-color: #ececef; color: #18181b; }
  .cl-pick.on { background-color: #18181b; color: #fff; }
  .cl-pick .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--k); }
  .cl-pick.type.on { background-color: color-mix(in srgb, var(--k) 14%, #fff); color: color-mix(in srgb, var(--k) 75%, #000); box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--k) 45%, #fff); }
  .cl-switch-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; padding: 12px 14px; border: none; border-radius: 14px; background: #fafafa; font: inherit; text-align: left; cursor: pointer; transition: background-color .12s ease; }
  .cl-switch-row:hover { background-color: #f4f4f5; }
  .cl-switch-row b { display: block; font-size: 14px; font-weight: 600; color: var(--ink); }
  .cl-switch-row small { display: block; margin-top: 2px; font-size: 12.5px; color: #8e8e93; line-height: 1.4; }
  .cl-switch { position: relative; flex-shrink: 0; width: 42px; height: 26px; padding: 0; border: none; border-radius: 999px; background: #e4e4e7; cursor: pointer; transition: background-color .18s ease; }
  .cl-switch::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform .18s cubic-bezier(.22,1,.36,1); }
  .cl-switch.on { background-color: #34c759; }
  .cl-switch.on::after { transform: translateX(16px); }
  .cl-type-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px 7px 14px; border-radius: 14px; background: #fafafa; }
  .cl-type-row .dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .cl-type-row .cl-field { height: 38px; background-color: #fff; box-shadow: 0 0 0 1px #ececef; }
  .cl-type-row .cl-field:focus { box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
  .cl-type-row.off { opacity: .6; }
  .cl-always { flex-shrink: 0; font-size: 12px; font-weight: 600; color: #8e8e93; white-space: nowrap; }
  .cl-del { margin-left: auto; color: #dc2626; }

  @media (max-width: 900px) {
    .cl-spacer { display: none; }
  }
  @media (max-width: 640px) {
    .cl-root { padding: 16px 14px 28px; }
    .cl-head { flex-wrap: nowrap; align-items: center; margin-bottom: 14px; }
    .cl-head h1 { font-size: 26px; }
    .cl-head p { display: none; }
    .cl-new { width: 38px; padding: 0; }
    .cl-new-t { display: none; }
    .cl-month { flex: 1 1 calc(100% - 96px); }
    .cl-month h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 19px; }
    .cl-search-wrap { order: 5; flex: 1 1 100%; }
    .cl-search { width: 100%; }
    .cl-wd { padding: 8px 0; text-align: center; font-size: 12px; }
    .cl-wd .l { display: none; }
    .cl-wd .s { display: inline; }
    .cl-cell { min-height: 58px; padding: 4px 2px 6px; display: flex; flex-direction: column; align-items: center; }
    .cl-cell-top { justify-content: center; margin-bottom: 3px; }
    .cl-add, .cl-evs { display: none; }
    .cl-num { min-width: 28px; height: 28px; font-size: 13.5px; }
    .cl-dots { display: flex; gap: 3px; justify-content: center; }
    .cl-dots span { width: 6px; height: 6px; border-radius: 50%; }
    .cl-agenda { padding: 0 14px 12px; }
    .cl-row, .cl-daylist .cl-row { grid-template-columns: 22px 50px minmax(0, 1fr); gap: 10px; }
    .cl-row .cl-faces { display: none; }
    .cl-panel { top: 6px; right: 6px; bottom: 6px; left: 6px; width: auto; max-width: none; border-radius: 22px; }
    .cl-overlay { padding: 0; align-items: flex-end; }
    .cl-modal { width: 100%; max-height: 94dvh; border-radius: 24px 24px 0 0; padding: 22px 18px 0; }
    .cl-menu { right: auto; left: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cl-panel, .cl-scrim, .cl-modal, .cl-overlay, .cl-menu { animation: none; }
  }
`

export default function CalendarPage() {
  // Seed from the shared identity cache so a revisit resolves the company
  // synchronously and the month's events load without a blank gate.
  const seed = peekCompanyUser()
  const [companyId, setCompanyId] = useState<string | null>(seed?.companyId ?? null)
  const [userId, setUserId] = useState<string | null>(null)
  const [me, setMe] = useState('')
  const [loading, setLoading] = useState(!seed?.companyId)
  const [events, setEvents] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [locationFilter, setLocationFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [defaultOutlet, setDefaultOutlet] = useState<string | null>(null)
  const outletPrefApplied = useRef(false)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<any>(null)
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  // The single event opened in the right slide-out (from a pill click).
  const [selectedEvent, setSelectedEvent] = useState<any>(null)

  // ── Reminder settings ────────────────────────────────────────────────────
  const [showReminders, setShowReminders] = useState(false)
  const [reminders, setReminders] = useState<any>({ reminders_enabled: false, lead_hours: 24, email: true })
  const [savingRem, setSavingRem] = useState(false)

  // ── Event-type config (per-company: rename + show/hide, edited on the fly) ──
  const [typeCfg, setTypeCfg] = useState<Record<string, { label?: string; enabled?: boolean }>>({})
  const [showTypes, setShowTypes] = useState(false)
  const [savingTypes, setSavingTypes] = useState(false)
  const typeMeta = useMemo(() => {
    const out: Record<string, { label: string; bg: string; fg: string; dot: string; enabled: boolean; locked?: boolean }> = {}
    for (const [k, base] of Object.entries(EVENT_TYPE_BASE)) {
      const cfg = typeCfg[k] || {}
      out[k] = { ...base, label: (cfg.label && cfg.label.trim()) || base.label, enabled: cfg.enabled !== false }
    }
    return out
  }, [typeCfg])
  // Types offered when creating an event / in the filter (hidden ones are still
  // labelled correctly wherever an existing event of that type is shown).
  const enabledTypeKeys = useMemo(() => Object.keys(typeMeta).filter(k => typeMeta[k].enabled), [typeMeta])

  // Persist calendar_settings without clobbering the other half (reminders vs types).
  const persistCalendarSettings = async (patch: any) => {
    if (!companyId) return
    const merged = { ...reminders, event_types: typeCfg, ...patch }
    await (supabase as any).from('companies').update({ calendar_settings: merged }).eq('id', companyId)
  }

  const saveReminders = async () => {
    if (!companyId) return
    setSavingRem(true)
    try {
      await persistCalendarSettings({})
      setShowReminders(false)
    } catch (e: any) { alertDialog({ title: 'Couldn’t save your reminders', message: e.message }) }
    finally { setSavingRem(false) }
  }

  const saveTypes = async () => {
    if (!companyId) return
    setSavingTypes(true)
    try {
      await persistCalendarSettings({ event_types: typeCfg })
      setShowTypes(false)
    } catch (e: any) { alertDialog({ title: 'Couldn’t save your booking types', message: e.message }) }
    finally { setSavingTypes(false) }
  }

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      setUserId(user.id)
      setMe(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Me')
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id, calendar_settings').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (owned?.[0]?.calendar_settings && Object.keys(owned[0].calendar_settings).length) {
        const cs = owned[0].calendar_settings
        setReminders({ reminders_enabled: false, lead_hours: 24, email: true, ...cs })
        if (cs.event_types && typeof cs.event_types === 'object') setTypeCfg(cs.event_types)
      }
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      setCompanyId(cid)
      setLoading(false)
    })()
  }, [])

  const load = async () => {
    if (!companyId) return
    // The whole weeks the month grid shows, so the days from the months either
    // side carry their events too.
    const range = gridRange(cursor)
    const from = range.start.toISOString()
    const to = range.end.toISOString()
    // Instant paint on revisit / month re-navigation: show the last events we
    // rendered for this exact view while the fresh data loads in the background.
    const cacheKey = `calendar:${companyId}:${from}:${locationFilter}`
    const cached = readCache<{ events: any[]; locations: any[] }>(cacheKey)
    if (cached) {
      setEvents(cached.events)
      setLocations(cached.locations)
    }
    // Outlet filtering is done client-side (below) so it matches the Tasks page:
    // the server only checks location_id, which misses events assigned to an
    // outlet via the multi-outlet location_ids array (and never filtered the
    // merged conversation_tasks at all).
    // Every type is loaded; the type chips filter on the page, so each chip
    // can show how many of its events the month holds.
    const params = new URLSearchParams({ companyId, from, to })
    const res = await authFetch(`/api/calendar?${params}`)
    const d = await res.json()
    let evts: any[] = d.events || []

    // Tasks created on the Tasks page have a due date but live in
    // conversation_tasks, so they never appeared here. Show them alongside
    // calendar events (read-only markers — editing happens on the Tasks page).
    {
      try {
        const { data: rows } = await (supabase as any).from('conversation_tasks')
          .select('*').eq('company_id', companyId)
          .gte('due_date', from).lte('due_date', to).limit(2000)
        const taskEvents = (rows || [])
          .filter((t: any) => t.due_date)
          .map((t: any) => ({
            id: `task:${t.id}`,
            _taskId: t.id,
            _fromTasks: true,
            company_id: t.company_id,
            conversation_id: t.conversation_id,
            event_type: 'task',
            title: t.title || t.text,
            notes: t.text,
            starts_at: t.due_date,
            is_all_day: true,
            location_id: t.location_id || null,
            location_ids: Array.isArray(t.location_ids) ? t.location_ids : (t.location_id ? [t.location_id] : []),
            status: (t.status === 'done' || t.done) ? 'completed'
              : t.status === 'in_progress' ? 'in_progress' : 'scheduled',
            assignees: Array.isArray(t.assignees) ? t.assignees : [],
            assigned_to_name: t.assigned_to || null,
            assigned_to_id: t.assigned_to_id || null,
          }))
        evts = [...evts, ...taskEvents]
      } catch { /* tasks unavailable — just show calendar events */ }
    }

    // Filter by the selected outlet the same way the Tasks page does: match on
    // location_id OR any entry in the location_ids array. Events/tasks with no
    // outlet are hidden while a specific outlet is selected.
    if (locationFilter) {
      const outletsOf = (e: any) => (Array.isArray(e.location_ids) && e.location_ids.length) ? e.location_ids : (e.location_id ? [e.location_id] : [])
      evts = evts.filter(e => outletsOf(e).includes(locationFilter))
    }

    const locs = d.locations || []
    setEvents(evts)
    setLocations(locs)
    writeCache(cacheKey, { events: evts, locations: locs })
  }

  useEffect(() => { load() }, [companyId, cursor, locationFilter])

  // Per-user default outlet (shared with the Tasks page). Applied once on load.
  useEffect(() => {
    if (!companyId || !userId) return
    ;(async () => {
      try {
        const res = await authFetch(`/api/user-prefs?userId=${userId}&companyId=${companyId}&key=default_outlet`)
        const d = await res.json()
        const dv = d?.prefs?.default_outlet
        if (dv && typeof dv === 'object') {
          setDefaultOutlet(dv.id || null)
          if (dv.id && !outletPrefApplied.current) { setLocationFilter(dv.id); outletPrefApplied.current = true }
        }
      } catch {}
    })()
  }, [companyId, userId])

  const setDefaultOutletPref = (id: string | null) => {
    setDefaultOutlet(id)
    setLocationFilter(id || '')
    if (companyId && userId) authFetch('/api/user-prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, companyId, key: 'default_outlet', value: { id } }) }).catch(() => {})
  }

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const members: any[] = []
      // Owner and staff side by side. Board visitors can't be assigned, and on
      // a busy board they'd crowd staff out of one read.
      const [{ data: co }, tm] = await Promise.all([
        (supabase as any).from('companies').select('owner_id, name').eq('id', companyId).maybeSingle(),
        loadStaffRows(supabase, companyId).catch(() => []),
      ])
      if (co?.owner_id) {
        members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner' })
      }
      for (const m of (tm || [])) {
        if (companyId && m.company_id && m.company_id !== companyId) continue
        const uid = m.user_id || m.id
        if (members.some(x => x.user_id === uid)) continue
        members.push({
          id: m.id, user_id: uid,
          name: m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member'),
          email: m.email,
          pending: m.status === 'invited',
        })
      }
      // Show the team now; real profile names fill in a moment later.
      setTeam([...members])
      await enrichNames(members)
      setTeam([...members])
    })()
  }, [companyId])

  // Build the month grid (Monday-first, as is normal in Australia): whole
  // weeks, with the days from the months either side shown faded.
  const grid = useMemo(() => {
    const { start, end } = gridRange(cursor)
    const cells: { d: Date; out: boolean }[] = []
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      cells.push({ d: new Date(d), out: d.getMonth() !== cursor.getMonth() })
    }
    return cells
  }, [cursor])

  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  // Local YYYY-MM-DD. toISOString() converts to UTC first, which in Melbourne
  // (UTC+10/+11) rolls a midnight-local date back to the previous day — that's
  // why clicking the 5th opened the 4th. Build the string from local parts.
  const localYmd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // The type chips filter here, on the page.
  const visibleEvents = useMemo(() => typeFilter ? events.filter(e => e.event_type === typeFilter) : events, [events, typeFilter])
  const byDay = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const e of sortEvents(visibleEvents)) {
      const d = new Date(e.starts_at)
      const k = keyOf(d)
      ;(m[k] ||= []).push(e)
    }
    return m
  }, [visibleEvents])

  const monthLabel = cursor.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })
  const isToday = (d: Date) => keyOf(d) === keyOf(new Date())

  // Search matches title, notes and assignee names, across the loaded month.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return visibleEvents.filter(e => {
      const names = (Array.isArray(e.assignees) ? e.assignees.map((a: any) => a.name) : [e.assigned_to_name])
        .filter(Boolean).join(' ')
      return [e.title, e.notes, names].filter(Boolean)
        .some((s: string) => dec(s).toLowerCase().includes(q))
    })
  }, [search, visibleEvents])

  const shift = (n: number) => setCursor(c => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const goToday = () => { const d = new Date(); d.setDate(1); setCursor(d) }

  // Month grid or a day-by-day agenda. Remembered on this device; phones start
  // on the agenda, where a month grid is too small to read.
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [showEarlier, setShowEarlier] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === 'month' || v === 'agenda') setView(v)
      else if (window.matchMedia('(max-width: 640px)').matches) setView('agenda')
    } catch {}
  }, [])
  const setViewPref = (v: 'month' | 'agenda') => { setView(v); try { localStorage.setItem(VIEW_KEY, v) } catch {} }

  // ← and → step through months, T comes back to today, Esc closes whatever is open.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (ev.metaKey || ev.ctrlKey || ev.altKey || document.querySelector('.cd-overlay')) return
      if (editing || showTypes || showReminders) {
        if (ev.key === 'Escape') { setEditing(null); setShowTypes(false); setShowReminders(false) }
        return
      }
      if (selectedEvent || dayOpen) {
        if (ev.key === 'Escape') { if (selectedEvent && dayOpen) setSelectedEvent(null); else { setSelectedEvent(null); setDayOpen(null) } }
        return
      }
      if (ev.key === 'ArrowLeft') shift(-1)
      else if (ev.key === 'ArrowRight') shift(1)
      else if (ev.key === 't' || ev.key === 'T') goToday()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, showTypes, showReminders, selectedEvent, dayOpen])

  const save = async () => {
    if (!companyId || !editing?.title?.trim() || !editing?.date) return
    const startsAt = editing.is_all_day
      ? new Date(`${editing.date}T00:00:00`).toISOString()
      : new Date(`${editing.date}T${editing.time || '09:00'}:00`).toISOString()

    const res = await authFetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId, id: editing.id,
        event_type: editing.event_type || 'appointment',
        title: editing.title, notes: editing.notes,
        starts_at: startsAt,
        is_all_day: !!editing.is_all_day,
        time_window: editing.time_window || null,
        location_id: editing.location_id || null,
        location_ids: (editing.location_ids && editing.location_ids.length)
          ? editing.location_ids
          : (editing.location_id ? [editing.location_id] : []),
        address: editing.address || null,
        status: editing.status || 'scheduled',
        assigned_to_id: (typeof editing.assigned_to_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(editing.assigned_to_id)) ? editing.assigned_to_id : null,
        assigned_to_name: editing.assigned_to_name || null,
        assignees: editing.assignees || [],
        reminder_channels: (editing.assignees || []).length
          ? (editing.reminder_channels || ['in_app', 'email', 'sms'])
          : null,
        notify_customer: !!editing.notify_customer,
        customer_contact_id: editing.customer_contact_id || null,
        attachments: editing.attachments || [],
      }),
    })
    const d = await res.json()
    if (!res.ok) { alertDialog(d.error || 'Could not save'); return }
    setEditing(null)
    await load()
  }

  const remove = async (id: string) => {
    if (!companyId || !await confirmDialog('Delete this event?')) return
    await authFetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action: 'delete', id }),
    })
    setEditing(null); setDayOpen(null)
    await load()
  }

  const setStatus = async (id: string, status: string, notifyCustomer: boolean) => {
    if (!companyId) return
    await authFetch('/api/calendar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, action: 'set_status', id, status, notifyCustomer }),
    })
    await load()
  }

  // Mark done / not done straight from the calendar — the tick on each pill and
  // the button in the slide-out both call this. Updates the UI optimistically so
  // the tick fills in instantly, then persists. Tasks (which live in
  // conversation_tasks) and calendar events are handled separately.
  const applyStatusLocal = (id: string, status: string) => {
    setEvents(cur => cur.map(x => x.id === id ? { ...x, status } : x))
    setSelectedEvent((prev: any) => prev && prev.id === id ? { ...prev, status } : prev)
  }
  const toggleDone = async (e: any) => {
    if (!companyId) return
    const wasDone = e.status === 'completed'
    const next = wasDone ? 'scheduled' : 'completed'
    applyStatusLocal(e.id, next)
    try {
      if (e._fromTasks) {
        const done = !wasDone
        await (supabase as any).from('conversation_tasks')
          .update({ done, status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null })
          .eq('id', e._taskId)
      } else {
        await authFetch('/api/calendar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, action: 'set_status', id: e.id, status: next, notifyCustomer: false }),
        })
      }
    } catch { /* optimistic state stays; next load reconciles */ }
    load()
  }

  const editEvent = (e: any) => {
    setDayOpen(null); setSelectedEvent(null)
    setEditing({ ...e, date: localYmd(new Date(e.starts_at)), time: new Date(e.starts_at).toTimeString().slice(0, 5), assignees: (Array.isArray(e.assignees) && e.assignees.length) ? e.assignees : (e.assigned_to_id ? [{ id: e.assigned_to_id, name: e.assigned_to_name }] : []) })
  }
  const newEventOn = (d: Date) => setEditing({ event_type: enabledTypeKeys[0] || 'appointment', date: localYmd(d), time: '09:00', status: 'scheduled' })
  const closePanel = () => { setSelectedEvent(null); setDayOpen(null) }
  const tasksHref = (e: any) => `/admin/tasks?task=${e._taskId}&date=${localYmd(new Date(e.starts_at))}`
  const outletNames = (e: any): string[] => {
    const ids: string[] = (e.location_ids && e.location_ids.length) ? e.location_ids : (e.location_id ? [e.location_id] : [])
    return ids.map(id => locations.find(l => l.id === id)).filter(Boolean).map((l: any) => l.label || l.suburb)
  }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  const today0 = new Date(); today0.setHours(0, 0, 0, 0)
  // Past the day it was due and still not done. Appointments and bookings
  // that have been and gone are just past, so only work that needs doing counts.
  const isOverdue = (e: any) => OVERDUE_TYPES.includes(e.event_type) && new Date(e.starts_at) < today0 && !['completed', 'cancelled', 'missed'].includes(e.status)
  const inMonth = (e: any) => { const d = new Date(e.starts_at); return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth() }
  const isThisMonth = cursor.getFullYear() === today0.getFullYear() && cursor.getMonth() === today0.getMonth()
  const monthAll = events.filter(inMonth)
  const monthShown = visibleEvents.filter(inMonth)
  const overdue = monthShown.filter(isOverdue)
  const typeCount = (k: string) => monthAll.filter(e => e.event_type === k).length

  const rowFor = (e: any) => {
    const m = typeMeta[e.event_type] || typeMeta.appointment
    const st = STATUS_META[e.status] || STATUS_META.scheduled
    const done = e.status === 'completed'
    const ppl = peopleOf(e)
    const outlets = outletNames(e)
    const od = isOverdue(e)
    const atts = Array.isArray(e.attachments) ? e.attachments.length : 0
    return (
      <div key={e.id} className={`cl-row${done ? ' done' : ''}${e.status === 'cancelled' ? ' cancelled' : ''}`} role="button" tabIndex={0}
        style={{ ['--k' as any]: m.dot }} onClick={() => setSelectedEvent(e)}
        onKeyDown={ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSelectedEvent(e) } }}>
        <button type="button" className={`cl-check${done ? ' on' : ''}`} title={done ? 'Mark not done' : 'Mark done'} aria-label={done ? 'Mark not done' : 'Mark done'}
          onClick={ev => { ev.stopPropagation(); toggleDone(e) }}>{done && <Ic n="check" s={11} w={3.2} />}</button>
        <span className="cl-when">{e.is_all_day ? 'All day' : shortTime(new Date(e.starts_at))}</span>
        <div style={{ minWidth: 0 }}>
          <p className="cl-row-title">{dec(e.title)}</p>
          <div className="cl-row-meta">
            <span className="cl-tag dot" style={tint(m.dot)}>{m.label}</span>
            {od ? <span className="cl-tag dot" style={tint('#dc2626')}>Overdue</span>
              : e.status !== 'scheduled' && <span className="cl-tag dot" style={tint(st.color)}>{st.label}</span>}
            {e.time_window && <span>{e.time_window}</span>}
            {outlets.length > 0 && <span>{outlets.join(', ')}</span>}
            {e.contact && <span>{e.contact.name || e.contact.email}</span>}
            {atts > 0 && <span className="cl-clip"><Ic n="clip" s={13} />{atts}</span>}
          </div>
        </div>
        {ppl.length > 0 ? <Faces people={ppl} /> : <span className="cl-faces" />}
      </div>
    )
  }

  const dayGroup = ([k, d, list]: [string, Date, any[]]) => {
    const rel = relDay(d, today0)
    return (
      <section key={k}>
        <div className={`cl-dh${rel === 'Today' ? ' today' : ''}`}>
          {rel || d.toLocaleDateString('en-AU', { weekday: 'long' })}
          <small>{rel ? d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }) : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}</small>
          <span className="n">{list.length}</span>
        </div>
        {list.map(rowFor)}
      </section>
    )
  }

  const agenda = () => {
    if (!monthShown.length) {
      const what = typeFilter ? (typeMeta[typeFilter]?.label || 'events').toLowerCase() : ''
      return <EmptyScroll kinds={['calendar']} title={typeFilter ? `No ${what} this month` : 'Nothing on the calendar this month'}
        line={typeFilter ? 'Try another type, or add one.' : 'Deliveries, appointments, bookings and tasks show up here, day by day.'}
        action={<button type="button" className="cv-btn" onClick={() => newEventOn(isThisMonth ? new Date() : cursor)}>New event</button>} />
    }
    const groups = groupByDay(monthShown, keyOf)
    if (!isThisMonth) return groups.map(dayGroup)
    // This month: start at today, with the days already gone folded away.
    const earlier = groups.filter(g => g[1] < today0)
    const rest = groups.filter(g => g[1] >= today0)
    const earlierN = earlier.reduce((n, g) => n + g[2].length, 0)
    const earlierOd = earlier.reduce((n, g) => n + g[2].filter(isOverdue).length, 0)
    return (
      <>
        {earlier.length > 0 && (
          <button type="button" className="cl-earlier" aria-expanded={showEarlier} onClick={() => setShowEarlier(v => !v)}>
            Earlier this month · {earlierN} event{earlierN === 1 ? '' : 's'}
            {earlierOd > 0 && <span className="od">· {earlierOd} overdue</span>}
            <Ic n="chevD" s={15} />
          </button>
        )}
        {showEarlier && earlier.map(dayGroup)}
        {rest.length ? rest.map(dayGroup) : <p className="cl-muted">Nothing else this month.</p>}
      </>
    )
  }

  const dayPanel = (k: string) => {
    const d = dayKeyDate(k)
    const list = byDay[k] || []
    const doneN = list.filter(e => e.status === 'completed').length
    const rel = relDay(d, today0)
    return (
      <>
        <div className="cl-ph">
          <div className="cl-ph-top">
            {rel && <span className="cl-kicker">{rel}</span>}
            <span style={{ flex: 1 }} />
            <button type="button" className="cl-ic sm" onClick={closePanel} aria-label="Close" title="Close"><Ic n="x" s={16} /></button>
          </div>
          <h2 className="cl-ph-title">{d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          <p className="cl-ph-sub">{list.length} event{list.length === 1 ? '' : 's'}{doneN > 0 ? ` · ${doneN} done` : ''}</p>
          <div className="cl-acts">
            <button type="button" className="cl-act primary" onClick={() => { closePanel(); newEventOn(d) }}><Ic n="plus" s={15} w={2.4} />New event</button>
          </div>
        </div>
        <div className="cl-pbody">
          <div className="cl-sect cl-daylist">
            {list.length ? list.map(rowFor) : <EmptyScroll compact kinds={['calendar']} title="Nothing on this day" line="Add an event and it shows up here." />}
          </div>
        </div>
      </>
    )
  }

  const eventPanel = (e: any) => {
    const m = typeMeta[e.event_type] || typeMeta.appointment
    const st = STATUS_META[e.status] || STATUS_META.scheduled
    const done = e.status === 'completed'
    const ppl = peopleOf(e)
    const outlets = outletNames(e)
    const od = isOverdue(e)
    const d = new Date(e.starts_at)
    const rel = relDay(d, today0)
    const dateStr = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
    const chans: string[] = Array.isArray(e.reminder_channels) ? e.reminder_channels : []
    const atts: any[] = Array.isArray(e.attachments) ? e.attachments : []
    const notes = e.notes ? dec(e.notes) : ''
    return (
      <>
        <div className="cl-ph">
          <div className="cl-ph-top">
            {dayOpen && <button type="button" className="cl-back" onClick={() => setSelectedEvent(null)}><Ic n="chevL" s={15} />{relDay(dayKeyDate(dayOpen), today0) || dayKeyDate(dayOpen).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</button>}
            <span style={{ flex: 1 }} />
            {!e._fromTasks && <button type="button" className="cl-ic sm danger" onClick={() => remove(e.id)} aria-label="Delete event" title="Delete event"><Ic n="trash" s={16} /></button>}
            <button type="button" className="cl-ic sm" onClick={closePanel} aria-label="Close" title="Close"><Ic n="x" s={16} /></button>
          </div>
          <div className="cl-ph-tags">
            <span className="cl-tag dot" style={tint(m.dot)}>{m.label}</span>
            {od ? <span className="cl-tag dot" style={tint('#dc2626')}>Overdue</span>
              : e.status !== 'scheduled' && <span className="cl-tag dot" style={tint(st.color)}>{st.label}</span>}
          </div>
          <h2 className="cl-ph-title">{dec(e.title)}</h2>
          <p className="cl-ph-sub">{rel ? `${rel}, ` : ''}{dateStr} · {e.is_all_day ? 'All day' : shortTime(d)}</p>
          <div className="cl-acts">
            {e.event_type !== 'delivery' && (
              <button type="button" className={`cl-act ${done ? 'done' : 'primary'}`} onClick={() => toggleDone(e)} title={done ? 'Mark not done' : undefined}>
                <Ic n="check" s={15} w={2.6} />{done ? 'Done' : 'Mark done'}
              </button>
            )}
            {e._fromTasks
              ? <a className="cl-act" href={tasksHref(e)}><Ic n="external" s={15} />Open in Tasks</a>
              : <button type="button" className="cl-act" onClick={() => editEvent(e)}><Ic n="edit" s={15} />Edit</button>}
            {e.conversation_id && <a className="cl-act" href={`/admin/inbox?conversation=${e.conversation_id}`}><Ic n="chat" s={15} />Open chat</a>}
          </div>
        </div>
        <div className="cl-pbody">
          {e.event_type === 'delivery' && (
            <div className="cl-sect">
              <p className="cl-sect-h">Delivery</p>
              <div className="cl-choices">
                {DELIVERY_STEPS.map(([k, label]) => (
                  <button key={k} type="button" className={`cl-choice${e.status === k ? ' on' : ''}`}
                    onClick={async () => {
                      const notify = e.conversation_id ? await confirmDialog(`Tell the customer? ("${label}")`) : false
                      applyStatusLocal(e.id, k)
                      setStatus(e.id, k, notify)
                    }}>{label}</button>
                ))}
              </div>
            </div>
          )}
          <div className="cl-sect">
            <p className="cl-sect-h">Details</p>
            <div className="cl-line"><Ic n="clock" s={15} /><span>{dateStr} · {e.is_all_day ? 'All day' : shortTime(d)}{e.time_window && <><br />Promised {e.time_window}</>}</span></div>
            {e.address && (
              <div className="cl-line"><Ic n="pin" s={15} /><span>{e.address} · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.address)}`} target="_blank" rel="noopener noreferrer">Map</a></span></div>
            )}
            {outlets.length > 0 && <div className="cl-line"><Ic n="store" s={15} /><span>{outlets.join(', ')}</span></div>}
            {e.contact && <div className="cl-line"><Ic n="user" s={15} /><span>{e.contact.name || e.contact.email}{e.contact.name && e.contact.email ? ` · ${e.contact.email}` : ''}</span></div>}
            {ppl.length > 0 && chans.length > 0 && <div className="cl-line"><Ic n="bell" s={15} /><span>Reminds the team by {listOf(chans.map(c => CHANNEL_LABEL[c] || c))}</span></div>}
            {e.notify_customer && <div className="cl-line"><Ic n="chat" s={15} /><span>The customer gets a reminder too</span></div>}
          </div>
          {ppl.length > 0 && (
            <div className="cl-sect">
              <p className="cl-sect-h">Team</p>
              {ppl.map((p: any, i: number) => <div key={i} className="cl-person"><Face name={p.name} size={30} />{p.name}</div>)}
            </div>
          )}
          {notes && notes !== dec(e.title) && (
            <div className="cl-sect"><p className="cl-sect-h">Notes</p><p className="cl-notes">{notes}</p></div>
          )}
          {atts.length > 0 && (
            <div className="cl-sect">
              <p className="cl-sect-h">Photos &amp; files <span className="cl-count">{atts.length}</span></p>
              <div className="cl-thumbs">
                {atts.map((a: any, i: number) => {
                  const isImg = a.kind === 'image' || (a.type || '').startsWith('image/')
                  const isVid = a.kind === 'video' || (a.type || '').startsWith('video/')
                  const ext = ((a.name || a.url || '').split('?')[0].split('.').pop() || 'file').slice(0, 4).toUpperCase()
                  return (
                    <a key={i} className="cl-thumb" href={a.url} target="_blank" rel="noopener noreferrer" title={a.name || ''}>
                      {isImg ? <img src={a.url} alt={a.name || ''} /> : isVid ? <Ic n="play" s={20} /> : ext}
                    </a>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="cl-root">
      <style>{CAL_CSS}</style>

      <div className="cl-head">
        <div>
          <h1>Calendar</h1>
          <p>Deliveries, appointments, bookings and tasks, in one place.</p>
        </div>
        <div className="cl-head-acts">
          <button type="button" className="cl-ic" onClick={() => setShowReminders(true)} aria-label="Reminder settings" title={reminders.reminders_enabled ? 'Reminders are on' : 'Reminders are off'}>
            <Ic n="bell" s={17} />{reminders.reminders_enabled && <span className="cl-badge" />}
          </button>
          <button type="button" className="cl-ic" onClick={() => setShowTypes(true)} aria-label="Edit event types" title="Event types"><Ic n="gear" s={17} /></button>
          <button type="button" className="cv-btn cv-btn-primary cl-new" onClick={() => newEventOn(new Date())}><Ic n="plus" s={16} w={2.4} /><span className="cl-new-t">New event</span></button>
        </div>
      </div>

      <div className="cl-bar">
        <div className="cl-month">
          <button type="button" className="cl-ic sm" onClick={() => shift(-1)} aria-label="Previous month" title="Previous month (←)"><Ic n="chevL" s={17} /></button>
          <button type="button" className="cl-ic sm" onClick={() => shift(1)} aria-label="Next month" title="Next month (→)"><Ic n="chevR" s={17} /></button>
          <h2>{monthLabel}</h2>
        </div>
        <button type="button" className="cl-pill" onClick={goToday} disabled={isThisMonth} title="Back to this month (T)">Today</button>
        <span className="cl-spacer" />
        <div className="seg" role="tablist" aria-label="View">
          {(['month', 'agenda'] as const).map(v => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? 'on' : ''} onClick={() => setViewPref(v)}>
              <Ic n={v === 'month' ? 'grid' : 'list'} s={15} />{v === 'month' ? 'Month' : 'Agenda'}
            </button>
          ))}
        </div>
        {locations.length > 0 && (
          <OutletPicker locations={locations} value={locationFilter} onChange={setLocationFilter}
            defaultOutlet={defaultOutlet} onSetDefault={setDefaultOutletPref} />
        )}
        <div className="cl-search-wrap">
          <Ic n="search" s={15} />
          <input className="cl-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events…" aria-label="Search events" />
          {search && <button type="button" className="cl-search-x" onClick={() => setSearch('')} aria-label="Clear search"><Ic n="x" s={13} w={2.4} /></button>}
        </div>
      </div>

      <div className="cl-types" role="group" aria-label="Show by type">
        <button type="button" className={`cl-chip all${!typeFilter ? ' on' : ''}`} aria-pressed={!typeFilter} onClick={() => setTypeFilter('')}>
          All<span className="n">{monthAll.length}</span>
        </button>
        {enabledTypeKeys.map(k => (
          <button key={k} type="button" className={`cl-chip${typeFilter === k ? ' on' : ''}`} aria-pressed={typeFilter === k}
            style={{ ['--k' as any]: typeMeta[k].dot }} onClick={() => setTypeFilter(typeFilter === k ? '' : k)}>
            <span className="dot" />{typeMeta[k].label}<span className="n">{typeCount(k)}</span>
          </button>
        ))}
        {overdue.length > 0 && (
          <button type="button" className="cl-chip warn" onClick={() => { setSearch(''); setViewPref('agenda'); setShowEarlier(true) }} title="Show them in the agenda">
            <span className="dot" />{overdue.length} overdue
          </button>
        )}
      </div>

      {searchResults ? (
        <div className="cl-card">
          <p className="cl-results">{searchResults.length} result{searchResults.length === 1 ? '' : 's'} for “{search.trim()}” around {monthLabel}</p>
          {searchResults.length === 0
            ? <EmptyScroll kinds={['calendar']} title="No matches" line={`Nothing on the calendar matches “${search.trim()}”. Try a name, a phone number or a word from the note.`}
                action={<button type="button" className="cv-btn" onClick={() => setSearch('')}>Clear search</button>} />
            : <div className="cl-agenda">{groupByDay(searchResults, keyOf).map(dayGroup)}</div>}
        </div>
      ) : view === 'agenda' ? (
        <div className="cl-card"><div className="cl-agenda">{agenda()}</div></div>
      ) : (
        <div className="cl-card">
          <div className="cl-wds">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => (
              <div key={d} className="cl-wd"><span className="l">{d.slice(0, 3)}</span><span className="s">{d[0]}</span></div>
            ))}
          </div>
          <div className="cl-grid">
            {grid.map(({ d, out }) => {
              const k = keyOf(d)
              const evs = byDay[k] || []
              const today = isToday(d)
              const label = d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
              return (
                <div key={k} className={`cl-cell${out ? ' out' : ''}${today ? ' today' : ''}${d.getDay() % 6 === 0 ? ' wknd' : ''}`}
                  onClick={() => evs.length ? setDayOpen(k) : newEventOn(d)}>
                  <div className="cl-cell-top">
                    <span className="cl-num" aria-label={label}>{out && d.getDate() === 1 ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : d.getDate()}</span>
                    <button type="button" className="cl-add" aria-label={`New event on ${label}`} title="New event"
                      onClick={ev => { ev.stopPropagation(); newEventOn(d) }}><Ic n="plus" s={13} w={2.4} /></button>
                  </div>
                  <div className="cl-evs">
                    {evs.slice(0, 3).map(e => {
                      const m = typeMeta[e.event_type] || typeMeta.appointment
                      const done = e.status === 'completed'
                      const atts = Array.isArray(e.attachments) ? e.attachments.length : 0
                      return (
                        <div key={e.id} className={`cl-ev${done ? ' done' : ''}${e.status === 'cancelled' ? ' cancelled' : ''}`}
                          style={{ ['--k' as any]: m.dot, ['--f' as any]: m.fg }} title={dec(e.title)}
                          onClick={ev => { ev.stopPropagation(); setSelectedEvent(e) }}>
                          <button type="button" className={`cl-tick${done ? ' on' : ''}`} title={done ? 'Mark not done' : 'Mark done'} aria-label={done ? 'Mark not done' : 'Mark done'}
                            onClick={ev => { ev.stopPropagation(); toggleDone(e) }}>{done && <Ic n="check" s={8} w={4} />}</button>
                          {!e.is_all_day && <span className="cl-ev-time">{shortTime(new Date(e.starts_at))}</span>}
                          <span className="cl-ev-title">{dec(e.title)}</span>
                          {atts > 0 && <span className="cl-ev-clip"><Ic n="clip" s={11} />{atts}</span>}
                        </div>
                      )
                    })}
                    {evs.length > 3 && <button type="button" className="cl-more" onClick={ev => { ev.stopPropagation(); setDayOpen(k) }}>+{evs.length - 3} more</button>}
                  </div>
                  {evs.length > 0 && (
                    <div className="cl-dots" aria-hidden="true">
                      {evs.slice(0, 4).map(e => <span key={e.id} style={{ background: (typeMeta[e.event_type] || typeMeta.appointment).dot }} />)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="cl-note">
        <Ic n="info" s={15} />
        <span><b>Prexty sync isn’t available yet.</b> Prexty POS doesn’t offer an API we can use, so everything here is Colvy’s own calendar. When Prexty is ready, your existing events will sync without re-entering anything.</span>
      </div>

      {/* A day's events, or one event, in a panel that floats in from the right. */}
      {(dayOpen || selectedEvent) && (
        <>
          <div className="cl-scrim" onClick={closePanel} />
          <aside className="cl-panel" role="dialog" aria-modal="true" aria-label={selectedEvent ? dec(selectedEvent.title) : 'Day'}>
            {selectedEvent ? eventPanel(selectedEvent) : dayPanel(dayOpen!)}
          </aside>
        </>
      )}

      {/* Reminder settings */}
      {showReminders && (
        <div className="cl-overlay" onClick={() => setShowReminders(false)}>
          <div className="cl-modal" role="dialog" aria-modal="true" aria-label="Reminders" onClick={e => e.stopPropagation()}>
            <h2>Reminders</h2>
            <p className="cl-lead">Tell the team about events that are due or coming up. Each event is announced once, never repeatedly.</p>
            <SwitchRow on={!!reminders.reminders_enabled} onChange={v => setReminders({ ...reminders, reminders_enabled: v })}
              title="Remind the team" hint="Off by default, so nobody gets surprise emails." />
            {reminders.reminders_enabled && (
              <>
                <label className="cl-lbl" htmlFor="cl-lead">How far ahead</label>
                <select id="cl-lead" className="cl-field" value={reminders.lead_hours} onChange={e => setReminders({ ...reminders, lead_hours: Number(e.target.value) })}>
                  <option value={2}>2 hours before</option>
                  <option value={12}>12 hours before</option>
                  <option value={24}>1 day before</option>
                  <option value={48}>2 days before</option>
                </select>
                <div style={{ marginTop: 12 }}>
                  <SwitchRow on={reminders.email !== false} onChange={v => setReminders({ ...reminders, email: v })}
                    title="Also email the team" hint="Goes to every active team member. In-app notifications are sent either way." />
                </div>
              </>
            )}
            <div className="modal-sticky-foot">
              <button type="button" className="cv-btn cv-btn-primary" onClick={saveReminders} disabled={savingRem}>{savingRem ? 'Saving…' : 'Save'}</button>
              <button type="button" className="cv-btn" onClick={() => setShowReminders(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Event types: rename and show or hide, on the fly */}
      {showTypes && (
        <div className="cl-overlay" onClick={() => setShowTypes(false)}>
          <div className="cl-modal" role="dialog" aria-modal="true" aria-label="Event types" onClick={e => e.stopPropagation()}>
            <h2>Event types</h2>
            <p className="cl-lead">Rename the types your team uses, and turn off the ones you don’t. Existing events keep their type.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(EVENT_TYPE_BASE).map(([k, base]) => {
                const cfg = typeCfg[k] || {}
                const enabled = cfg.enabled !== false
                return (
                  <div key={k} className={`cl-type-row${enabled ? '' : ' off'}`}>
                    <span className="dot" style={{ background: base.dot }} />
                    <input className="cl-field" value={cfg.label ?? base.label} placeholder={base.label} aria-label={`Name for ${base.label}`}
                      onChange={e => setTypeCfg({ ...typeCfg, [k]: { ...cfg, label: e.target.value } })} />
                    {base.locked
                      ? <span className="cl-always" title="Tasks come from the Tasks page and can’t be hidden">Always on</span>
                      : <button type="button" role="switch" aria-checked={enabled} aria-label={`Show ${cfg.label || base.label}`} className={`cl-switch${enabled ? ' on' : ''}`}
                          onClick={() => setTypeCfg({ ...typeCfg, [k]: { ...cfg, enabled: !enabled } })} />}
                  </div>
                )
              })}
            </div>
            <div className="modal-sticky-foot">
              <button type="button" className="cv-btn cv-btn-primary" onClick={saveTypes} disabled={savingTypes}>{savingTypes ? 'Saving…' : 'Save'}</button>
              <button type="button" className="cv-btn" onClick={() => setShowTypes(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Event editor */}
      {editing && (
        <div className="cl-overlay" onClick={() => setEditing(null)}>
          <div className="cl-modal" role="dialog" aria-modal="true" aria-label={editing.id ? 'Edit event' : 'New event'} onClick={e => e.stopPropagation()}>
            {!(editing.event_type === 'task' && !editing.id) && <h2>{editing.id ? 'Edit event' : 'New event'}</h2>}

            <label className="cl-lbl">Type</label>
            <div className="cl-wrap">
              {enabledTypeKeys.map(k => (
                <button key={k} type="button" className={`cl-pick type${editing.event_type === k ? ' on' : ''}`} style={{ ['--k' as any]: typeMeta[k].dot }}
                  aria-pressed={editing.event_type === k} onClick={() => setEditing({ ...editing, event_type: k })}>
                  <span className="dot" />{typeMeta[k].label}
                </button>
              ))}
            </div>

            {editing.event_type === 'task' && !editing.id ? (
              // A new "Task" gets the full Tasks editor (priority, repeats,
              // colour, order link, assignees) right here — the same form as the
              // Tasks page. It writes a real task, which then shows on both pages.
              <TaskEditor
                companyId={companyId} team={team} outlets={locations} me={me} userId={userId}
                initial={{
                  title: editing.title || '',
                  due: editing.date || '',
                  locationIds: (editing.location_ids && editing.location_ids.length)
                    ? editing.location_ids
                    : (editing.location_id ? [editing.location_id] : []),
                }}
                onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); load() }}
              />
            ) : (<>
            <label className="cl-lbl" htmlFor="cl-title">Title</label>
            <input id="cl-title" className="cl-field" value={editing.title || ''} placeholder="Deliver 4ft tank to Bikiran"
              onChange={e => setEditing({ ...editing, title: e.target.value })} />

            <div className="cl-two" style={editing.is_all_day ? { gridTemplateColumns: '1fr' } : undefined}>
              <div>
                <label className="cl-lbl" htmlFor="cl-date">Date</label>
                <input id="cl-date" type="date" className="cl-field" value={editing.date || ''}
                  onChange={e => setEditing({ ...editing, date: e.target.value })} />
              </div>
              {!editing.is_all_day && (
                <div>
                  <label className="cl-lbl" htmlFor="cl-time">Time</label>
                  <input id="cl-time" type="time" className="cl-field" value={editing.time || '09:00'}
                    onChange={e => setEditing({ ...editing, time: e.target.value })} />
                </div>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <SwitchRow on={!!editing.is_all_day} onChange={v => setEditing({ ...editing, is_all_day: v })} title="All day" hint="No set time. It sits at the top of the day." />
            </div>

            {editing.event_type === 'delivery' && (
              <>
                <label className="cl-lbl" htmlFor="cl-window">Time window <small>what you promise the customer</small></label>
                <input id="cl-window" className="cl-field" value={editing.time_window || ''} placeholder="10am – 2pm"
                  onChange={e => setEditing({ ...editing, time_window: e.target.value })} />
                <label className="cl-lbl" htmlFor="cl-address">Delivery address</label>
                <input id="cl-address" className="cl-field" value={editing.address || ''} placeholder="5 Clunes Avenue, Dallas VIC"
                  onChange={e => setEditing({ ...editing, address: e.target.value })} />
              </>
            )}

            {locations.length > 0 && (() => {
              // Multiple outlets: an event can involve more than one store.
              const selIds: string[] = (editing.location_ids && editing.location_ids.length)
                ? editing.location_ids
                : (editing.location_id ? [editing.location_id] : [])
              const toggle = (id: string) => {
                const next = selIds.includes(id) ? selIds.filter(x => x !== id) : [...selIds, id]
                setEditing({ ...editing, location_ids: next, location_id: next[0] || null })
              }
              return (
                <>
                  <label className="cl-lbl">Outlets <small>{selIds.length ? 'pick one or more' : 'not tied to an outlet'}</small></label>
                  <div className="cl-wrap">
                    {locations.map(l => {
                      const on = selIds.includes(l.id)
                      return (
                        <button key={l.id} type="button" className={`cl-pick${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle(l.id)}>
                          {on && <Ic n="check" s={13} w={2.8} />}{l.label || l.suburb}
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            })()}

            {/* Assign to one or more team members and remind them */}
            <label className="cl-lbl">Team members</label>
            <AssigneePicker
              members={team as any}
              value={editing.assignees || []}
              onChange={(next) => setEditing({
                ...editing,
                assignees: next,
                assigned_to_id: next[0]?.id || null,
                assigned_to_name: next[0]?.name || null,
              })}
            />

            {(editing.assignees || []).length > 0 && (
              <>
                <label className="cl-lbl">Remind them by</label>
                <div className="cl-wrap">
                  {([['in_app', 'In-app'], ['email', 'Email'], ['sms', 'SMS']] as const).map(([ch, lbl]) => {
                    const chans: string[] = editing.reminder_channels || ['in_app', 'email', 'sms']
                    const on = chans.includes(ch)
                    return (
                      <button key={ch} type="button" className={`cl-pick${on ? ' on' : ''}`} aria-pressed={on}
                        onClick={() => setEditing({ ...editing, reminder_channels: on ? chans.filter(c => c !== ch) : [...chans, ch] })}>
                        {on && <Ic n="check" s={13} w={2.8} />}{lbl}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* Customer reminder — only meaningful for customer-facing event types */}
            {['delivery', 'appointment', 'booking', 'pickup'].includes(editing.event_type) && (
              <div style={{ marginTop: 16 }}>
                <SwitchRow on={!!editing.notify_customer} onChange={v => setEditing({ ...editing, notify_customer: v })}
                  title="Also remind the customer" hint={`Sends the customer a reminder before this ${typeMeta[editing.event_type]?.label.toLowerCase() || 'event'}.`} />
                {editing.notify_customer && (
                  <div style={{ marginTop: 8 }}>
                    <CustomerPicker
                      companyId={companyId}
                      value={editing.customer_contact_id || null}
                      valueName={editing.customer_name || null}
                      onChange={(id, nm) => setEditing({ ...editing, customer_contact_id: id, customer_name: nm })}
                    />
                  </div>
                )}
              </div>
            )}

            <label className="cl-lbl">Photos &amp; videos</label>
            <AttachmentUploader
              companyId={companyId}
              value={editing.attachments || []}
              onChange={(a) => setEditing({ ...editing, attachments: a })}
              folder="calendar"
            />

            <label className="cl-lbl" htmlFor="cl-notes">Notes</label>
            <textarea id="cl-notes" className="cl-field" value={editing.notes || ''} placeholder="Anything the team should know"
              onChange={e => setEditing({ ...editing, notes: e.target.value })} />

            <div className="modal-sticky-foot">
              <button type="button" className="cv-btn cv-btn-primary" onClick={save} disabled={!editing.title?.trim() || !editing.date}>Save</button>
              <button type="button" className="cv-btn" onClick={() => setEditing(null)}>Cancel</button>
              {editing.id && <button type="button" className="cv-btn cl-del" onClick={() => remove(editing.id)}>Delete</button>}
            </div>
            </>)}
          </div>
        </div>
      )}
    </div>
  )
}

// Outlet filter with a per-user "default" — left-click selects, right-click an
// outlet sets it as this user's default (persisted, shared with the Tasks page).
function OutletPicker({ locations, value, onChange, defaultOutlet, onSetDefault }: {
  locations: any[]; value: string; onChange: (v: string) => void
  defaultOutlet: string | null; onSetDefault: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open && !menu) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setMenu(null) } }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, menu])
  const labelOf = (id: string) => { const l = locations.find(x => x.id === id); return l ? (l.label || l.suburb || 'Outlet') : 'Outlet' }
  const current = value ? labelOf(value) : 'All outlets'
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className={`cl-ctl${value ? ' set' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Ic n="store" s={15} />
        <span className="cl-ctl-t">{current}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div className="cl-menu" role="menu">
          <button type="button" role="menuitem" className={`cl-mi${value === '' ? ' on' : ''}`} onClick={() => { onChange(''); setOpen(false) }}>
            All outlets{value === '' && <span className="cl-mi-check"><Ic n="check" s={14} w={2.6} /></span>}
          </button>
          {locations.map(l => (
            <button key={l.id} type="button" role="menuitem" title="Right-click to set as your default"
              className={`cl-mi${value === l.id ? ' on' : ''}`}
              onClick={() => { onChange(l.id); setOpen(false) }}
              onContextMenu={e => { e.preventDefault(); setMenu({ x: Math.min(e.clientX, window.innerWidth - 220), y: e.clientY, id: l.id }) }}>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label || l.suburb}</span>
              {defaultOutlet === l.id && <span className="cl-def">Default</span>}
              {value === l.id && <span className="cl-mi-check"><Ic n="check" s={14} w={2.6} /></span>}
            </button>
          ))}
          <p className="cl-menu-foot">Right-click an outlet to make it your default.</p>
        </div>
      )}
      {menu && (
        <>
          <div onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null) }} style={{ position: 'fixed', inset: 0, zIndex: 400 }} />
          <div className="cl-menu" style={{ position: 'fixed', top: menu.y, left: menu.x, right: 'auto', zIndex: 401 }}>
            <p className="cl-menu-head">{labelOf(menu.id)}</p>
            {defaultOutlet === menu.id
              ? <button type="button" className="cl-mi" onClick={() => { onSetDefault(null); setMenu(null); setOpen(false) }}>Remove as default</button>
              : <button type="button" className="cl-mi" onClick={() => { onSetDefault(menu.id); setMenu(null); setOpen(false) }}>Make this my default outlet</button>}
          </div>
        </>
      )}
    </div>
  )
}

function SwitchRow({ on, onChange, title, hint }: { on: boolean; onChange: (v: boolean) => void; title: string; hint?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="cl-switch-row" onClick={() => onChange(!on)}>
      <span><b>{title}</b>{hint && <small>{hint}</small>}</span>
      <span className={`cl-switch${on ? ' on' : ''}`} aria-hidden="true" />
    </button>
  )
}

function Face({ name, size = 26 }: { name: string; size?: number }) {
  const h = hue(name || '')
  return <span className="cl-face" title={name} style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${h} 60% 92%)`, color: `hsl(${h} 45% 36%)` }}>{initials(name)}</span>
}

function Faces({ people }: { people: any[] }) {
  const shown = people.slice(0, 3)
  return (
    <span className="cl-faces" title={people.map(p => p.name).join(', ')}>
      {shown.map((p, i) => <Face key={i} name={p.name} />)}
      {people.length > 3 && <span className="cl-face more">+{people.length - 3}</span>}
    </span>
  )
}

const PATHS: Record<string, ReactNode> = {
  chevL: <path d="m15 18-6-6 6-6" />,
  chevR: <path d="m9 18 6-6-6-6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  bell: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  search: <><circle cx="11" cy="11" r="7.5" /><path d="m20 20-3.5-3.5" /></>,
  grid: <><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8.5 3v3M15.5 3v3" /></>,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  store: <><path d="M3 9.5 4.5 4h15L21 9.5" /><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M5 12v8h14v-8" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  chat: <path d="M20 14.5a2 2 0 0 1-2 2H8.5L4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  clip: <path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7" />,
  play: <path d="M7 4.5v15l12-7.5z" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
}

function Ic({ n, s = 16, w = 2 }: { n: string; s?: number; w?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[n]}</svg>
}
