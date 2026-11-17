// Colvy Powers in the browser: one shared copy of /api/powers/me for the
// top-bar chip, the inbox (pins) and the Powers page, plus "check my recent
// work" after closing a conversation or ticking a task. When a business has
// Powers off, the first answer says so and nothing else is ever asked: no
// polling, no checks, no UI.

import { useEffect, useSyncExternalStore } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'

export type PowersMe = {
  enabled: boolean
  eligible?: boolean
  isAdmin?: boolean
  setup?: string | null
  me?: { id: string; name: string }
  wallet?: { coins: number; xp: number; level: number; title: string; from: number; to: number; progress: number; streak: number; bestStreak: number; savers: number; earned: number }
  today?: { coins: number; xp: number; capCoins: number; capXp: number }
  recent?: any[]
  live?: any
  achievements?: { code: string; name: string; hint: string; icon: string; earned: boolean; at: string | null }[]
  freshAchievements?: string[]
  rules?: { id: string; label: string; coins: number; xp: number }[]
  powers?: { id: string; price: number; cooldown: number; daily: number }[]
  leaderboard?: 'everyone' | 'team' | 'off'
  team?: { id: string; name: string; avatar: string | null }[]
}

export type PowersEvent =
  | { kind: 'earned'; coins: number; xp: number; rule: string; leveledUp?: boolean; level?: number; title?: string }
  | { kind: 'reversed'; coins: number; xp: number; rule: string }
  | { kind: 'badge'; name: string; icon: string }
  | { kind: 'spent'; coins: number }

let state: PowersMe | null = null
let companyId: string | null = null
let inflight: Promise<void> | null = null
let lastLoad = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export const powersSnapshot = () => state
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** Reload /api/powers/me (at most every `gap` ms unless forced). */
export async function refreshPowers(force = false, gap = 4000): Promise<void> {
  if (!companyId) return
  if (!force && Date.now() - lastLoad < gap) return inflight || undefined
  if (inflight) return inflight
  const co = companyId
  inflight = (async () => {
    try {
      const r = await authFetch(`/api/powers/me?companyId=${co}`)
      if (!r.ok || co !== companyId) return
      const next: PowersMe = await r.json()
      const before = state
      state = next
      lastLoad = Date.now()
      // Coins that arrived from elsewhere (the background sweep, a job, a gift) still get their moment.
      if (before?.wallet && next.wallet && next.wallet.coins > before.wallet.coins && !justShown()) {
        celebrate({ kind: 'earned', coins: next.wallet.coins - before.wallet.coins, xp: Math.max(0, next.wallet.xp - before.wallet.xp), rule: 'sync', leveledUp: next.wallet.level > before.wallet.level, level: next.wallet.level, title: next.wallet.title })
      }
      for (const code of next.freshAchievements || []) {
        const a = next.achievements?.find(x => x.code === code)
        if (a) celebrate({ kind: 'badge', name: a.name, icon: a.icon })
      }
      emit()
    } catch {} finally { inflight = null }
  })()
  return inflight
}

let shownAt = 0
const justShown = () => Date.now() - shownAt < 6000
/** Tell the chip to animate (a reward, a reversal, a badge). */
export function celebrate(e: PowersEvent) {
  if (e.kind === 'earned' || e.kind === 'reversed') shownAt = Date.now()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('colvy:powers', { detail: e }))
}

/**
 * "Check my recent work": after closing a conversation or ticking a task.
 * The server decides what's due. Does nothing when Powers is off.
 */
export async function powersCheck(hint?: { type: 'resolve' | 'task'; id: string }) {
  if (!companyId || !state?.enabled || !state.eligible) return
  try {
    const r = await authFetch('/api/powers/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, hint: hint || null }) })
    if (!r.ok) return
    const d = await r.json()
    for (const x of d.results || []) {
      if (x.status === 'ok') celebrate({ kind: 'earned', coins: x.coins, xp: x.xp, rule: x.rule, leveledUp: x.leveledUp, level: x.level, title: x.title })
      else if (x.status === 'reversed') celebrate({ kind: 'reversed', coins: x.coins, xp: x.xp, rule: x.rule })
    }
    if (d.results?.length && state?.wallet && d.wallet) {
      state = { ...state, wallet: { ...state.wallet, ...d.wallet } }
      lastLoad = Date.now()
      emit()
    }
  } catch {}
}

// A live "something changed" ping between teammates' screens, over the
// realtime connection the app already has. It carries nothing: each screen
// just re-reads its own state from the server, so a nudge or a pin shows
// within a second instead of at the next minute's refresh.
let channel: any = null
let channelFor: string | null = null
function joinTeamChannel(co: string) {
  if (channelFor === co) return
  leaveTeamChannel()
  try {
    channel = (supabase as any).channel(`powers-${co}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'refresh' }, () => { window.setTimeout(() => void refreshPowers(false, 1500), 200 + Math.random() * 700) })
      .subscribe()
    channelFor = co
  } catch { channel = null; channelFor = null }
}
function leaveTeamChannel() {
  if (channel) { try { (supabase as any).removeChannel(channel) } catch {} }
  channel = null; channelFor = null
}
/** Tell teammates' screens to look again (after using a power, a thanks, an unpin). */
export function pingTeam() {
  try { channel?.send({ type: 'broadcast', event: 'refresh', payload: {} }) } catch {}
}

/** Called from anywhere after a task or conversation changes; a no-op when Powers is off. */
export const powersHint = (type: 'resolve' | 'task', id: string) => { if (state?.enabled) void powersCheck({ type, id }) }

export async function powersApi(path: string, body?: any, method = 'POST') {
  const r = await authFetch(path, body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await r.json().catch(() => ({}))
  return { ok: r.ok, status: r.status, data }
}

/**
 * The shared Powers state for this workspace. The first component to mount
 * with a company starts it; while it's on, it refreshes every minute when the
 * tab is visible and on focus.
 */
export function usePowers(company: string | null | undefined): PowersMe | null {
  const snap = useSyncExternalStore(subscribe, powersSnapshot, () => null)
  useEffect(() => {
    if (!company) return
    if (company !== companyId) { companyId = company; state = null; lastLoad = 0; leaveTeamChannel(); emit() }
    void refreshPowers().then(() => { if (state?.enabled && companyId === company) joinTeamChannel(company); else if (!state?.enabled) leaveTeamChannel() })
    const tick = () => { if (document.visibilityState === 'visible' && state?.enabled) void refreshPowers() }
    const iv = window.setInterval(tick, 60_000)
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(iv); window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', tick) }
  }, [company])
  return snap && companyId === company ? snap : null
}

/** A fresh key per click, so a double click uses a power once. */
export const clickKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
