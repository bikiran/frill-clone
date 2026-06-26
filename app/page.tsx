'use client'
import { useEffect, useState } from 'react'

// Root page:
// - colvy.com → show landing  
// - prexty.colvy.com → middleware already rewrites to /board/prexty, this never runs
// - localhost → show landing
export default function RootPage() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const h = window.location.hostname
    const isSubdomain = h !== 'colvy.com' && h !== 'www.colvy.com' &&
      !h.includes('localhost') && !h.includes('vercel.app') &&
      h.endsWith('.colvy.com')

    if (isSubdomain) {
      // Shouldn't normally reach here since middleware rewrites / → /board/[slug]
      // But as fallback, redirect manually
      const slug = h.replace('.colvy.com', '')
      window.location.href = `/board/${slug}`
    } else {
      // colvy.com → landing page
      window.location.href = '/landing'
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #ff7a6b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
