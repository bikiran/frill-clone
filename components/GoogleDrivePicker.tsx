'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

// Loads Google Identity Services + Picker API and opens the native Drive picker.
// Requires two PUBLIC credentials (safe to expose):
//   NEXT_PUBLIC_GOOGLE_API_KEY   — API key with the Picker API enabled
//   NEXT_PUBLIC_GOOGLE_CLIENT_ID — OAuth client ID (Web application)
// No client secret is used; the token flow is entirely client-side.

const SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

declare global {
  interface Window { gapi?: any; google?: any }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src; s.async = true; s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

export interface DrivePickedFile {
  id: string
  name: string
  mimeType: string
  accessToken: string
}

export function useGoogleDrivePicker(onPicked: (files: DrivePickedFile[]) => void) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const configured = !!(apiKey && clientId)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const tokenClient = useRef<any>(null)
  const accessToken = useRef<string>('')

  useEffect(() => {
    if (!configured) return
    let cancelled = false
    ;(async () => {
      try {
        await loadScript('https://apis.google.com/js/api.js')
        await loadScript('https://accounts.google.com/gsi/client')
        // Load the picker module.
        await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))
        if (cancelled) return
        tokenClient.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: () => {}, // set per-request below
        })
        setReady(true)
      } catch (e) {
        console.error('[DrivePicker] load failed', e)
      }
    })()
    return () => { cancelled = true }
  }, [configured, clientId])

  const openPicker = useCallback(() => {
    if (!configured || !ready) return
    setLoading(true)
    tokenClient.current.callback = (resp: any) => {
      if (resp.error) { setLoading(false); return }
      accessToken.current = resp.access_token
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
        .setMimeTypes('image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,application/pdf')
        .setSelectFolderEnabled(false)
      const picker = new window.google.picker.PickerBuilder()
        .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
        .setOAuthToken(accessToken.current)
        .setDeveloperKey(apiKey!)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            const files: DrivePickedFile[] = (data.docs || []).map((d: any) => ({
              id: d.id, name: d.name, mimeType: d.mimeType, accessToken: accessToken.current,
            }))
            onPicked(files)
          }
          if (data.action === window.google.picker.Action.PICKED || data.action === window.google.picker.Action.CANCEL) {
            setLoading(false)
          }
        })
        .build()
      picker.setVisible(true)
    }
    // Request an access token (prompts consent the first time).
    tokenClient.current.requestAccessToken({ prompt: '' })
  }, [configured, ready, apiKey, onPicked])

  return { configured, ready, loading, openPicker }
}
