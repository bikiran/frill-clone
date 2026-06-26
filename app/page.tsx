'use client'
import { useEffect } from 'react'
import { redirect } from 'next/navigation'

export default function RootPage() {
  useEffect(() => {
    const h = window.location.hostname
    // On a subdomain (prexty.colvy.com) — stay and let board load via /roadmap etc
    // Actually redirect to the board index
    if (h !== 'colvy.com' && h !== 'www.colvy.com' && h.endsWith('.colvy.com')) {
      // Already on subdomain root — show board (handled by middleware rewrite or board page)
      // Do nothing, board content loads inline
    } else {
      // colvy.com root → landing page
      window.location.href = '/landing'
    }
  }, [])
  return null
}
