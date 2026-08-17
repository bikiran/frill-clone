'use client'

// A tiny cross-component store for "there is a live phone call right now".
//
// The call UI (CallBar for outbound, IncomingCallListener for inbound) lives in
// a different part of the tree from the inbox conversation list, but the list
// wants to show "Call in progress" on the matching conversation while a call is
// up. Rather than thread props/context through everything, both call widgets
// publish here and the list subscribes.
import { useSyncExternalStore } from 'react'

export interface ActiveCall {
  conversationId?: string | null
  contactId?: string | null
  number?: string | null
  name?: string | null
  status: 'ringing' | 'active'
}

let current: ActiveCall | null = null
const listeners = new Set<() => void>()

function emit() { listeners.forEach(l => l()) }

export function setActiveCall(c: ActiveCall | null) {
  current = c
  emit()
}

export function clearActiveCall() {
  if (current === null) return
  current = null
  emit()
}

export function getActiveCall(): ActiveCall | null { return current }

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

// React hook — re-renders the caller whenever the active call changes.
export function useActiveCall(): ActiveCall | null {
  return useSyncExternalStore(subscribe, getActiveCall, () => null)
}

// Does a live call belong to this conversation/contact/number? Matches on any of
// conversation id, contact id, or the last 9 digits of the phone number (so an
// inbound call that only knows the caller's number still lights up the thread).
export function callMatches(
  call: ActiveCall | null,
  opts: { conversationId?: string | null; contactId?: string | null; phone?: string | null },
): boolean {
  if (!call) return false
  if (call.conversationId && opts.conversationId && call.conversationId === opts.conversationId) return true
  if (call.contactId && opts.contactId && call.contactId === opts.contactId) return true
  const tail = (s?: string | null) => (s || '').replace(/\D/g, '').slice(-9)
  const a = tail(call.number)
  const b = tail(opts.phone)
  if (a && a.length >= 8 && a === b) return true
  return false
}
