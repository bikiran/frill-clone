'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Single-origin Google Drive picker.
//
// Google OAuth requires each JavaScript origin to be registered in the Cloud
// Console, and you CANNOT wildcard *.colvy.com. To avoid registering every
// company subdomain, we run the actual OAuth + Picker on the ROOT domain
// (https://colvy.com/drive-connect) in a popup, and receive the selected files
// back via postMessage. So only https://colvy.com needs to be registered.

const ROOT = 'https://colvy.com'

export interface DrivePickedFile {
  id: string
  name: string
  mimeType: string
  accessToken: string
}

export function useGoogleDrivePicker(onPicked: (files: DrivePickedFile[]) => void) {
  // The picker popup runs on the root domain and uses the public creds there, so
  // the subdomain doesn't need them. We consider it "configured" always; if the
  // root domain lacks creds, the popup shows a clear message.
  const configured = true
  const ready = true
  const [loading, setLoading] = useState(false)
  const popupRef = useRef<Window | null>(null)
  const onPickedRef = useRef(onPicked)
  onPickedRef.current = onPicked

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Accept only messages from the root colvy.com drive-connect page.
      let host = ''
      try { host = new URL(e.origin).hostname } catch {}
      if (host !== 'colvy.com' && host !== 'www.colvy.com') return
      const d: any = e.data
      if (!d || !d.colvyDrive) return
      if (d.type === 'picked') {
        setLoading(false)
        if (Array.isArray(d.files) && d.files.length) onPickedRef.current(d.files)
        try { popupRef.current?.close() } catch {}
      } else if (d.type === 'cancel') {
        setLoading(false)
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const openPicker = useCallback(() => {
    setLoading(true)
    const origin = typeof window !== 'undefined' ? window.location.origin : ROOT
    const url = `${ROOT}/drive-connect?origin=${encodeURIComponent(origin)}`
    const w = 520, h = 600
    const left = typeof window !== 'undefined' ? window.screenX + (window.outerWidth - w) / 2 : 0
    const top = typeof window !== 'undefined' ? window.screenY + (window.outerHeight - h) / 2 : 0
    popupRef.current = window.open(url, 'colvy-drive', `width=${w},height=${h},left=${left},top=${top}`)
    if (!popupRef.current) { setLoading(false); alert('Please allow pop-ups to import from Google Drive.') }
  }, [])

  return { configured, ready, loading, openPicker }
}
