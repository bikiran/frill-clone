'use client'
import { useEffect } from 'react'

// Root page router:
// - colvy.com / www.colvy.com → redirect to /landing  
// - *.colvy.com subdomains → middleware ALREADY rewrites / to /board/[slug], so this never runs
// - localhost / vercel preview → redirect to /landing
export default function RootPage() {
  useEffect(() => {
    window.location.replace('/landing')
  }, [])
  return null
}
