'use client'

import { useEffect, useState } from 'react'

// Single-origin Google Drive picker. This page always runs on the ROOT domain
// (colvy.com), so only https://colvy.com needs to be registered as an authorized
// JavaScript origin in Google Cloud — no per-subdomain registration. It runs the
// OAuth token flow + Picker here, then postMessages the selected files (with the
// access token) back to the opener window (which may be any *.colvy.com subdomain).

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

export default function DriveConnect() {
  const [status, setStatus] = useState('Loading Google Drive…')
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  // The opener origin we're allowed to post results back to (passed as ?origin=).
  const [openerOrigin, setOpenerOrigin] = useState<string>('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const origin = params.get('origin') || ''
    // Only allow posting back to colvy.com subdomains (or exact colvy.com).
    const safe = /^https:\/\/([a-z0-9-]+\.)?colvy\.com$/i.test(origin) ? origin : ''
    setOpenerOrigin(safe)

    if (!apiKey || !clientId) { setStatus('Google Drive is not configured (missing API key or client ID).'); return }
    if (!safe) { setStatus('Invalid opener origin.'); return }

    let cancelled = false
    ;(async () => {
      try {
        await loadScript('https://apis.google.com/js/api.js')
        await loadScript('https://accounts.google.com/gsi/client')
        await new Promise<void>((resolve) => window.gapi.load('picker', () => resolve()))
        if (cancelled) return
        setStatus('Opening Google sign-in…')

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (resp: any) => {
            if (resp.error) { setStatus('Sign-in cancelled or failed.'); return }
            const accessToken = resp.access_token
            setStatus('Select your files…')
            const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
              .setMimeTypes('image/png,image/jpeg,image/gif,image/webp,video/mp4,video/quicktime,application/pdf')
              .setSelectFolderEnabled(false)
            const picker = new window.google.picker.PickerBuilder()
              .enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED)
              .setOAuthToken(accessToken)
              .setDeveloperKey(apiKey!)
              .addView(view)
              .setCallback((data: any) => {
                if (data.action === window.google.picker.Action.PICKED) {
                  const files = (data.docs || []).map((d: any) => ({
                    id: d.id, name: d.name, mimeType: d.mimeType, accessToken,
                  }))
                  try { window.opener?.postMessage({ colvyDrive: true, type: 'picked', files }, safe) } catch {}
                  setStatus(`Sent ${files.length} file(s) back. You can close this window.`)
                  setTimeout(() => window.close(), 800)
                } else if (data.action === window.google.picker.Action.CANCEL) {
                  try { window.opener?.postMessage({ colvyDrive: true, type: 'cancel' }, safe) } catch {}
                  setStatus('Cancelled. You can close this window.')
                  setTimeout(() => window.close(), 600)
                }
              })
              .build()
            picker.setVisible(true)
          },
        })
        tokenClient.requestAccessToken({ prompt: '' })
      } catch (e: any) {
        setStatus('Failed to load Google Drive: ' + (e?.message || 'unknown error'))
      }
    })()
    return () => { cancelled = true }
  }, [apiKey, clientId])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#fafafa', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#ff7a6b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 20, marginBottom: 14 }}>C</div>
        <p style={{ fontSize: 14, color: '#1a1a1a', margin: 0 }}>{status}</p>
      </div>
    </div>
  )
}
