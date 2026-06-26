'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RootPage() {
  useEffect(() => {
    const h = window.location.hostname
    const isSubdomain = h !== 'colvy.com' && h !== 'www.colvy.com' && 
                        !h.includes('localhost') && !h.includes('vercel.app') && 
                        h.endsWith('.colvy.com')
    if (isSubdomain) {
      // Already on subdomain — redirect to the board
      const slug = h.replace('.colvy.com', '')
      window.location.href = `/board/${slug}`
    } else {
      window.location.href = '/landing'
    }
  }, [])
  return null
}
