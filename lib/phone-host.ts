'use client'

// Who the browser phone belongs to, kept OUTSIDE the admin layout.
//
// The phone (IncomingCallListener + GlobalCallBar) used to live inside the admin
// layout, so leaving /admin — the browser Back button, the "Ideas" or "Roadmap"
// links, any public page — unmounted it and hung up a live call. The admin layout
// now publishes the workspace + agent here, and the root layout keeps the phone
// mounted from then on, on every page of this tab. Saved in sessionStorage
// (per tab) so a reload on any page brings the phone straight back; cleared on
// sign-out.
import { useSyncExternalStore } from 'react'

export type PhoneHost = { companyId: string; agentName?: string; userId?: string | null }

const KEY = 'colvy-phone-host'
let current: PhoneHost | null = null
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

function load() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try { current = JSON.parse(sessionStorage.getItem(KEY) || 'null') } catch { current = null }
}

export function setPhoneHost(h: PhoneHost | null) {
  load()
  const same = JSON.stringify(h) === JSON.stringify(current)
  current = h
  try { h ? sessionStorage.setItem(KEY, JSON.stringify(h)) : sessionStorage.removeItem(KEY) } catch {}
  if (!same) emit()
}

export function getPhoneHost(): PhoneHost | null { load(); return current }

export function usePhoneHost(): PhoneHost | null {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    getPhoneHost,
    () => null,
  )
}
