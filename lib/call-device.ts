import { supabase } from '@/lib/supabase'

// A stable per-browser device id (persisted in localStorage) + a friendly name
// derived from the user agent, so a live call can be handed to THIS specific web
// session. Register/heartbeat writes it to call_devices via the API.

const KEY = 'colvy-call-device-id'

export function getCallDeviceId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = window.localStorage.getItem(KEY)
    if (!id) {
      id = 'web_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
      window.localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return 'web_ephemeral'
  }
}

// "Chrome on Mac", "Edge on Windows", "Safari on iPhone" — a human label for the
// device list. Best-effort from the UA; falls back to "Web".
export function getCallDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Web'
  const ua = navigator.userAgent || ''
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\//.test(ua) ? 'Opera' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os =
    /iPhone/.test(ua) ? 'iPhone' :
    /iPad/.test(ua) ? 'iPad' :
    /Android/.test(ua) ? 'Android' :
    /Mac OS X|Macintosh/.test(ua) ? 'Mac' :
    /Windows/.test(ua) ? 'Windows' :
    /Linux/.test(ua) ? 'Linux' : 'Web'
  return `${browser} on ${os}`
}

async function bearer(): Promise<string | null> {
  try { const { data } = await supabase.auth.getSession(); return data?.session?.access_token || null } catch { return null }
}

// Register / heartbeat this web session as an available device.
export async function registerCallDevice(companyId: string, opts?: { online?: boolean }): Promise<void> {
  if (!companyId || typeof window === 'undefined') return
  const token = await bearer()
  if (!token) return
  try {
    await fetch('/api/calls/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        deviceId: getCallDeviceId(),
        companyId,
        platform: 'web',
        deviceName: getCallDeviceName(),
        online: opts?.online !== false,
      }),
    })
  } catch { /* heartbeat is best-effort */ }
}

// The user's other online devices (for the "Continue call on" picker).
export async function listCallDevices(companyId: string): Promise<Array<{ deviceId: string; platform: string; deviceName: string; hasPush: boolean }>> {
  if (!companyId) return []
  const token = await bearer()
  if (!token) return []
  try {
    const res = await fetch(`/api/calls/devices?companyId=${encodeURIComponent(companyId)}&exclude=${encodeURIComponent(getCallDeviceId())}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await res.json()
    return Array.isArray(d?.devices) ? d.devices : []
  } catch { return [] }
}

// Authenticated POST helper for the handoff endpoints.
export async function handoffFetch(path: string, body: any): Promise<{ ok: boolean; data: any; status: number }> {
  const token = await bearer()
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body || {}),
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data, status: res.status }
}
