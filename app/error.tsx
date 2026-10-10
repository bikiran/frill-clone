'use client'

import { useEffect, useState } from 'react'
import { isChunkLoadError, reloadForNewVersion } from '@/lib/chunk-reload'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A new version was deployed while this tab was open: load it (once).
  const stale = isChunkLoadError(error)
  const [updating, setUpdating] = useState(stale)
  useEffect(() => { if (stale && !reloadForNewVersion()) setUpdating(false) }, [stale])
  if (updating) return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', color: '#6b7280', fontSize: 14 }}>
      Updating to the latest version…
    </div>
  )
  return (
    <div style={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ maxWidth: 440, textAlign: 'center', background: '#fff', borderRadius: 18, padding: 40, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#ff7a6b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22, marginBottom: 16 }}>C</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a', margin: '0 0 8px' }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>{stale ? 'Colvy was just updated. Reload to get the latest version.' : 'We hit a snag loading this page. Please try again.'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => (stale ? reloadForNewVersion(true) : reset())} style={{ padding: '10px 20px', borderRadius: 10, background: '#ff7a6b', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{stale ? 'Reload' : 'Try again'}</button>
          <a href="/" style={{ padding: '10px 20px', borderRadius: 10, background: '#f3f4f6', color: '#1a1a1a', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>Go home</a>
        </div>
        {error?.message && (
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '18px 0 0', wordBreak: 'break-word', fontFamily: 'monospace' }}>{error.message}</p>
        )}
      </div>
    </div>
  )
}
